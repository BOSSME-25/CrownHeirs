"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { inventoryItems, inventoryTxns, vendors } from "@/lib/db/schema";
import type { InventoryItem } from "@/lib/db/schema";
import { getAccess } from "@/lib/perms";
import { getDefaultOrg } from "@/lib/org";
import { logAudit } from "@/lib/audit";
import { isItemCategory, TXN_REASON_IDS, num } from "@/lib/inventory";

// Managers and above manage inventory (day-to-day operational task).
async function requireManage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canApprove) throw new Error("You don’t have permission to manage inventory.");
  return session?.user?.email ?? null;
}

const str = (formData: FormData, k: string) => {
  const v = formData.get(k);
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};
const dec = (formData: FormData, k: string) => {
  const s = str(formData, k);
  if (s == null) return null;
  const n = Number(s.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
};

function readItem(formData: FormData) {
  const category = str(formData, "category") ?? "retail";
  return {
    name: str(formData, "name") ?? "",
    brand: str(formData, "brand"),
    category: isItemCategory(category) ? category : "retail",
    sku: str(formData, "sku"),
    size: str(formData, "size"),
    unit: str(formData, "unit"),
    cost: dec(formData, "cost"),
    retailPrice: dec(formData, "retailPrice"),
    reorderPoint: dec(formData, "reorderPoint") ?? 0,
    vendorId: str(formData, "vendorId"),
    locationId: str(formData, "locationId"),
    notes: str(formData, "notes"),
  };
}

export async function createItem(formData: FormData) {
  const actor = await requireManage();
  const d = readItem(formData);
  if (!d.name) throw new Error("Item name is required.");
  const org = await getDefaultOrg();
  const initial = dec(formData, "initialQty") ?? 0;

  const [row] = await db
    .insert(inventoryItems)
    .values({
      orgId: org?.id ?? null,
      vendorId: d.vendorId,
      locationId: d.locationId,
      name: d.name,
      brand: d.brand,
      category: d.category,
      sku: d.sku,
      size: d.size,
      unit: d.unit,
      cost: d.cost != null ? String(d.cost) : null,
      retailPrice: d.retailPrice != null ? String(d.retailPrice) : null,
      onHand: String(Math.max(0, initial)),
      reorderPoint: String(d.reorderPoint),
      notes: d.notes,
    })
    .returning();

  if (initial > 0 && row) {
    await db.insert(inventoryTxns).values({
      orgId: org?.id ?? null,
      itemId: row.id,
      delta: String(initial),
      reason: "count",
      note: "Starting count",
      actorEmail: actor,
    });
  }
  await logAudit({ actorEmail: actor, action: "create", entity: "inventory_item", entityId: row?.id, detail: d.name });
  revalidatePath("/inventory");
  redirect(`/inventory?ok=${encodeURIComponent(`Added “${d.name}”`)}`);
}

export async function updateItem(id: string, formData: FormData) {
  const actor = await requireManage();
  const d = readItem(formData);
  if (!d.name) throw new Error("Item name is required.");
  // Note: on-hand is never edited here — it only changes through stock moves.
  await db
    .update(inventoryItems)
    .set({
      vendorId: d.vendorId,
      locationId: d.locationId,
      name: d.name,
      brand: d.brand,
      category: d.category,
      sku: d.sku,
      size: d.size,
      unit: d.unit,
      cost: d.cost != null ? String(d.cost) : null,
      retailPrice: d.retailPrice != null ? String(d.retailPrice) : null,
      reorderPoint: String(d.reorderPoint),
      notes: d.notes,
      updatedAt: new Date(),
    })
    .where(eq(inventoryItems.id, id));
  await logAudit({ actorEmail: actor, action: "update", entity: "inventory_item", entityId: id, detail: d.name });
  revalidatePath("/inventory");
  revalidatePath(`/inventory/${id}`);
  redirect(`/inventory/${id}?ok=${encodeURIComponent("Item saved")}`);
}

export async function setItemActive(id: string, active: boolean) {
  const actor = await requireManage();
  await db.update(inventoryItems).set({ active, updatedAt: new Date() }).where(eq(inventoryItems.id, id));
  await logAudit({ actorEmail: actor, action: active ? "reactivate" : "archive", entity: "inventory_item", entityId: id });
  revalidatePath("/inventory");
  redirect(`/inventory?ok=${encodeURIComponent(active ? "Item reactivated" : "Item archived")}`);
}

// Apply a signed change to on-hand and record it in the ledger.
async function applyMove(item: InventoryItem, delta: number, reason: string, note: string | null, unitCost: number | null, actor: string | null) {
  const current = num(item.onHand);
  const next = Math.max(0, current + delta);
  const realDelta = next - current;
  await db.update(inventoryItems).set({ onHand: String(next), updatedAt: new Date() }).where(eq(inventoryItems.id, item.id));
  await db.insert(inventoryTxns).values({
    orgId: item.orgId,
    itemId: item.id,
    delta: String(realDelta),
    reason: TXN_REASON_IDS.includes(reason) ? reason : "adjust",
    note,
    unitCost: unitCost != null ? String(unitCost) : null,
    actorEmail: actor,
  });
}

async function loadItem(id: string): Promise<InventoryItem> {
  const row = (await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)))[0];
  if (!row) throw new Error("Item not found.");
  return row;
}

export async function receiveStock(formData: FormData) {
  const actor = await requireManage();
  const id = String(formData.get("itemId") ?? "");
  const qty = dec(formData, "qty") ?? 0;
  if (qty <= 0) throw new Error("Enter a quantity greater than zero.");
  const item = await loadItem(id);
  await applyMove(item, qty, "receive", str(formData, "note"), dec(formData, "unitCost"), actor);
  revalidatePath(`/inventory/${id}`);
  revalidatePath("/inventory");
  redirect(`/inventory/${id}?ok=${encodeURIComponent(`Received ${qty}`)}`);
}

export async function adjustStock(formData: FormData) {
  const actor = await requireManage();
  const id = String(formData.get("itemId") ?? "");
  const amount = dec(formData, "amount") ?? 0;
  const direction = String(formData.get("direction") ?? "remove"); // add | remove
  const reason = String(formData.get("reason") ?? "adjust");
  if (amount <= 0) throw new Error("Enter an amount greater than zero.");
  const delta = direction === "add" ? amount : -amount;
  const item = await loadItem(id);
  await applyMove(item, delta, reason, str(formData, "note"), null, actor);
  revalidatePath(`/inventory/${id}`);
  revalidatePath("/inventory");
  redirect(`/inventory/${id}?ok=${encodeURIComponent("Stock updated")}`);
}

export async function setCount(formData: FormData) {
  const actor = await requireManage();
  const id = String(formData.get("itemId") ?? "");
  const counted = dec(formData, "counted");
  if (counted == null || counted < 0) throw new Error("Enter the counted quantity.");
  const item = await loadItem(id);
  const delta = Math.max(0, counted) - num(item.onHand);
  await applyMove(item, delta, "count", str(formData, "note") ?? "Physical count", null, actor);
  revalidatePath(`/inventory/${id}`);
  revalidatePath("/inventory");
  redirect(`/inventory/${id}?ok=${encodeURIComponent("Count recorded")}`);
}

// ── Vendors ──
function readVendor(formData: FormData) {
  return {
    name: str(formData, "name") ?? "",
    contactName: str(formData, "contactName"),
    phone: str(formData, "phone"),
    email: str(formData, "email"),
    website: str(formData, "website"),
    accountNumber: str(formData, "accountNumber"),
    notes: str(formData, "notes"),
  };
}

export async function createVendor(formData: FormData) {
  const actor = await requireManage();
  const d = readVendor(formData);
  if (!d.name) throw new Error("Vendor name is required.");
  const org = await getDefaultOrg();
  await db.insert(vendors).values({ orgId: org?.id ?? null, ...d });
  await logAudit({ actorEmail: actor, action: "create", entity: "vendor", detail: d.name });
  revalidatePath("/inventory/vendors");
  redirect(`/inventory/vendors?ok=${encodeURIComponent(`Added ${d.name}`)}`);
}

export async function updateVendor(id: string, formData: FormData) {
  const actor = await requireManage();
  const d = readVendor(formData);
  if (!d.name) throw new Error("Vendor name is required.");
  await db.update(vendors).set(d).where(eq(vendors.id, id));
  await logAudit({ actorEmail: actor, action: "update", entity: "vendor", entityId: id, detail: d.name });
  revalidatePath("/inventory/vendors");
  redirect(`/inventory/vendors?ok=${encodeURIComponent("Vendor saved")}`);
}

export async function setVendorActive(id: string, active: boolean) {
  await requireManage();
  await db.update(vendors).set({ active }).where(eq(vendors.id, id));
  revalidatePath("/inventory/vendors");
  redirect(`/inventory/vendors?ok=${encodeURIComponent(active ? "Vendor reactivated" : "Vendor archived")}`);
}
