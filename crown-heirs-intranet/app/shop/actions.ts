"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray } from "drizzle-orm";
import { put } from "@vercel/blob";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { shopOrderItems, shopOrders, shopProducts, shopVariants } from "@/lib/db/schema";
import type { ShopProduct, ShopVariant } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";
import { getDefaultOrg } from "@/lib/org";
import { getAccess } from "@/lib/perms";
import { logAudit } from "@/lib/audit";
import { adminEmails, APP_URL, emailLayout, sendEmail } from "@/lib/email";
import { dollarsToCents, formatPrice, isShopCategory, isStockMode, parseSizes, paymentStatusLabel, priceNumber } from "@/lib/shop-constants";
import { orderRecipients } from "@/lib/shop";
import { createPaymentLink } from "@/lib/squareCheckout";

const IMAGE_MAX = 8 * 1024 * 1024;

// Uploads a product photo to the private blob store; returns its pathname.
async function putProductImage(file: File): Promise<string> {
  if (file.size > IMAGE_MAX) throw new Error("Image is too large (max 8 MB). Try a smaller photo.");
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "photo";
  const blob = await put(`shop/${safe}`, file, {
    access: "private",
    addRandomSuffix: true,
    contentType: file.type || undefined,
  });
  return blob.pathname;
}

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};
const intOf = (fd: FormData, k: string) => {
  const s = str(fd, k);
  if (s == null) return null;
  const n = parseInt(s.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? n : null;
};

async function requireManage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canApprove) throw new Error("You don’t have permission to manage the shop.");
  return session?.user?.email ?? null;
}

async function me() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Not signed in.");
  const emp = await getEmployeeByEmail(email);
  if (!emp) throw new Error("You’re not on the team roster yet. Ask an admin to add you first.");
  return { email, emp };
}

const back = (to: string, msg: string) => redirect(`${to}?ok=${encodeURIComponent(msg)}`);

// ── Manage: products ──
export async function addProduct(formData: FormData) {
  const actor = await requireManage();
  const name = str(formData, "name");
  if (!name) throw new Error("Product name is required.");
  const org = await getDefaultOrg();
  const category = str(formData, "category") ?? "merch";
  const stockMode = str(formData, "stockMode") ?? "tracked";
  const price = priceNumber(str(formData, "price"));
  const sizes = parseSizes(str(formData, "sizes"));
  const initialStock = Math.max(0, intOf(formData, "initialStock") ?? 0);

  const file = formData.get("image");
  const imagePathname = file instanceof File && file.size > 0 ? await putProductImage(file) : null;

  const [product] = await db
    .insert(shopProducts)
    .values({
      orgId: org?.id ?? null,
      name,
      description: str(formData, "description"),
      category: isShopCategory(category) ? category : "merch",
      stockMode: isStockMode(stockMode) ? stockMode : "tracked",
      price: price != null ? String(price) : null,
      imageUrl: imagePathname ? null : str(formData, "imageUrl"),
      imagePathname,
    })
    .returning();

  // One variant per size, or a single "One size" if none were given.
  const labels = sizes.length ? sizes : ["One size"];
  await db.insert(shopVariants).values(
    labels.map((label, i) => ({
      orgId: org?.id ?? null,
      productId: product.id,
      label,
      stock: initialStock,
      sortOrder: i,
    })),
  );

  await logAudit({ actorEmail: actor, action: "create", entity: "shop_product", entityId: product.id, detail: name });
  revalidatePath("/shop/manage");
  revalidatePath("/shop");
  back("/shop/manage", `Added “${name}”`);
}

export async function updateProduct(formData: FormData) {
  const actor = await requireManage();
  const id = str(formData, "productId");
  if (!id) throw new Error("Missing product.");
  const name = str(formData, "name");
  if (!name) throw new Error("Product name is required.");
  const category = str(formData, "category") ?? "merch";
  const stockMode = str(formData, "stockMode") ?? "tracked";
  const price = priceNumber(str(formData, "price"));

  const file = formData.get("image");
  const newImage = file instanceof File && file.size > 0 ? await putProductImage(file) : null;
  const linkUrl = str(formData, "imageUrl");

  await db
    .update(shopProducts)
    .set({
      name,
      description: str(formData, "description"),
      category: isShopCategory(category) ? category : "merch",
      stockMode: isStockMode(stockMode) ? stockMode : "tracked",
      price: price != null ? String(price) : null,
      // A newly uploaded photo wins; otherwise keep/replace the external link.
      ...(newImage ? { imagePathname: newImage, imageUrl: null } : { imageUrl: linkUrl }),
      updatedAt: new Date(),
    })
    .where(eq(shopProducts.id, id));
  await logAudit({ actorEmail: actor, action: "update", entity: "shop_product", entityId: id, detail: name });
  revalidatePath("/shop/manage");
  revalidatePath("/shop");
  back("/shop/manage", "Product saved");
}

export async function setProductActive(formData: FormData) {
  const actor = await requireManage();
  const id = str(formData, "productId");
  const active = str(formData, "active") === "1";
  if (!id) throw new Error("Missing product.");
  await db.update(shopProducts).set({ active, updatedAt: new Date() }).where(eq(shopProducts.id, id));
  await logAudit({ actorEmail: actor, action: active ? "reactivate" : "archive", entity: "shop_product", entityId: id });
  revalidatePath("/shop/manage");
  revalidatePath("/shop");
  back("/shop/manage", active ? "Product is back in the shop" : "Product taken down");
}

// ── Manage: variants (sizes / stock) ──
export async function addVariant(formData: FormData) {
  const actor = await requireManage();
  const productId = str(formData, "productId");
  const label = str(formData, "label");
  if (!productId || !label) throw new Error("Enter a size/label.");
  const org = await getDefaultOrg();
  await db.insert(shopVariants).values({
    orgId: org?.id ?? null,
    productId,
    label,
    stock: Math.max(0, intOf(formData, "stock") ?? 0),
    sortOrder: Math.max(0, intOf(formData, "sortOrder") ?? 99),
  });
  await logAudit({ actorEmail: actor, action: "create", entity: "shop_variant", entityId: productId, detail: label });
  revalidatePath("/shop/manage");
  revalidatePath("/shop");
  back("/shop/manage", `Added size “${label}”`);
}

export async function setVariantStock(formData: FormData) {
  const actor = await requireManage();
  const id = str(formData, "variantId");
  const stock = intOf(formData, "stock");
  if (!id || stock == null) throw new Error("Enter a stock count.");
  await db.update(shopVariants).set({ stock: Math.max(0, stock) }).where(eq(shopVariants.id, id));
  await logAudit({ actorEmail: actor, action: "update", entity: "shop_variant", entityId: id, detail: `stock ${stock}` });
  revalidatePath("/shop/manage");
  revalidatePath("/shop");
  back("/shop/manage", "Stock updated");
}

export async function removeVariant(formData: FormData) {
  const actor = await requireManage();
  const id = str(formData, "variantId");
  if (!id) throw new Error("Missing size.");
  await db.delete(shopVariants).where(eq(shopVariants.id, id));
  await logAudit({ actorEmail: actor, action: "delete", entity: "shop_variant", entityId: id });
  revalidatePath("/shop/manage");
  revalidatePath("/shop");
  back("/shop/manage", "Size removed");
}

// ── Employee: place an order ──
export async function placeOrder(formData: FormData) {
  const { email, emp } = await me();

  // Collect requested quantities: fields named qty_<variantId>.
  const requested: { variantId: string; qty: number }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("qty_")) continue;
    const qty = parseInt(String(value).replace(/[^0-9]/g, ""), 10);
    if (Number.isFinite(qty) && qty > 0) requested.push({ variantId: key.slice(4), qty });
  }
  if (!requested.length) throw new Error("Choose at least one item and a quantity.");

  const variants = await db
    .select()
    .from(shopVariants)
    .where(inArray(shopVariants.id, requested.map((r) => r.variantId)));
  const variantById = new Map(variants.map((v) => [v.id, v] as const));
  const products = await db
    .select()
    .from(shopProducts)
    .where(inArray(shopProducts.id, [...new Set(variants.map((v) => v.productId))]));
  const productById = new Map(products.map((p) => [p.id, p] as const));

  // Validate before committing. Tracked items are limited by stock;
  // made-to-order items are always orderable.
  type Line = { v: ShopVariant; p: ShopProduct; qty: number };
  const lines: Line[] = [];
  const problems: string[] = [];
  for (const r of requested) {
    const v = variantById.get(r.variantId);
    if (!v) continue;
    const p = productById.get(v.productId);
    if (!p || !p.active) {
      problems.push("An item is no longer available — please refresh the shop.");
      continue;
    }
    if (p.stockMode === "tracked" && r.qty > v.stock) {
      problems.push(`${p.name} (${v.label}): only ${v.stock} left.`);
      continue;
    }
    lines.push({ v, p, qty: r.qty });
  }
  if (problems.length) throw new Error(problems.join(" "));
  if (!lines.length) throw new Error("Nothing to order.");

  const total = lines.reduce((s, l) => s + (priceNumber(l.p.price) ?? 0) * l.qty, 0);
  const wantSquare = str(formData, "paymentMethod") === "square";
  const useSquare = wantSquare && total > 0;
  const org = await getDefaultOrg();
  const note = str(formData, "note");

  const [order] = await db
    .insert(shopOrders)
    .values({
      orgId: org?.id ?? null,
      employeeId: emp.id,
      employeeName: emp.fullName,
      employeeEmail: email,
      note,
      paymentMethod: useSquare ? "square" : "payroll",
      paymentStatus: total === 0 ? "paid" : useSquare ? "pending" : "unpaid",
      totalAmount: total > 0 ? String(total) : null,
    })
    .returning();

  await db.insert(shopOrderItems).values(
    lines.map((l) => ({
      orgId: org?.id ?? null,
      orderId: order.id,
      productId: l.p.id,
      variantId: l.v.id,
      productName: l.p.name,
      variantLabel: l.v.label,
      unitPrice: l.p.price,
      quantity: l.qty,
    })),
  );

  // Decrement stock for tracked items only.
  for (const l of lines) {
    if (l.p.stockMode === "tracked") {
      await db.update(shopVariants).set({ stock: Math.max(0, l.v.stock - l.qty) }).where(eq(shopVariants.id, l.v.id));
    }
  }

  // If paying with Square, create a hosted payment link.
  let payUrl: string | null = null;
  if (useSquare) {
    const link = await createPaymentLink({
      amountCents: dollarsToCents(total),
      name: `Crown Heirs Team Shop — ${emp.fullName}`,
      buyerEmail: email,
      redirectUrl: `${APP_URL}/shop/paid?order=${order.id}`,
    });
    if (link) {
      payUrl = link.url;
      await db
        .update(shopOrders)
        .set({ squareOrderId: link.orderId, squarePaymentLinkId: link.linkId, paymentUrl: link.url })
        .where(eq(shopOrders.id, order.id));
    } else {
      // Square unavailable — fall back to "owed" so the order still stands.
      await db.update(shopOrders).set({ paymentMethod: "payroll", paymentStatus: "unpaid" }).where(eq(shopOrders.id, order.id));
    }
  }

  // Email the owners/directors.
  try {
    const rows = lines
      .map(
        (l) => `<tr>
          <td style="padding:6px 12px;border-top:1px solid #eee">${l.p.name}</td>
          <td style="padding:6px 12px;border-top:1px solid #eee">${l.v.label}</td>
          <td style="padding:6px 12px;border-top:1px solid #eee;text-align:right">${l.qty}</td>
          <td style="padding:6px 12px;border-top:1px solid #eee;text-align:right">${formatPrice(l.p.price) || "—"}</td>
        </tr>`,
      )
      .join("");
    const payLine = useSquare && payUrl
      ? `Paying online via Square (${formatPrice(total)}) — status will show on the Orders page once complete.`
      : `Payment: ${paymentStatusLabel(useSquare ? "square" : "payroll", total === 0 ? "paid" : useSquare ? "unpaid" : "unpaid")}${total > 0 ? ` — ${formatPrice(total)}` : ""}.`;
    const body =
      `<p><strong>${emp.fullName}</strong> (${email}) placed a Team Shop order.</p>` +
      (note ? `<p><em>Note:</em> ${note}</p>` : "") +
      `<table style="border-collapse:collapse;width:100%;font-size:14px">
        <thead><tr style="text-align:left;color:#a0624a;font-size:12px;text-transform:uppercase">
          <th style="padding:6px 12px">Item</th><th style="padding:6px 12px">Size</th>
          <th style="padding:6px 12px;text-align:right">Qty</th><th style="padding:6px 12px;text-align:right">Price</th>
        </tr></thead><tbody>${rows}</tbody></table>` +
      `<p style="margin-top:10px">${payLine}</p>` +
      `<p style="margin-top:10px">Export all orders to CSV from the Team Shop → Orders page.</p>`;
    const to = await orderRecipients();
    await sendEmail({
      to: to.length ? to : adminEmails(),
      subject: `Team Shop order — ${emp.fullName}`,
      html: emailLayout("New Team Shop order", body, "/shop/orders"),
    });
  } catch {
    // best-effort — the order is already recorded
  }

  await logAudit({ actorEmail: email, action: "create", entity: "shop_order", entityId: order.id, detail: `${lines.length} item(s)` });
  revalidatePath("/shop");
  revalidatePath("/shop/manage");
  revalidatePath("/shop/orders");

  // Send the employee to Square's hosted checkout, or back to the shop.
  if (payUrl) redirect(payUrl);
  back("/shop", useSquare ? "Order placed — but online payment was unavailable, so it's recorded as owed." : "Order placed — thank you! The team has been notified.");
}
