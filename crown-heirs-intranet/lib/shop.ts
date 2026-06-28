import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, shopOrderItems, shopOrders, shopProducts, shopVariants } from "@/lib/db/schema";
import type { ShopOrder, ShopOrderItem, ShopProduct, ShopVariant } from "@/lib/db/schema";
import { getDefaultOrg } from "@/lib/org";
import { adminEmails } from "@/lib/email";

export * from "@/lib/shop-constants";

export type ProductWithVariants = { product: ShopProduct; variants: ShopVariant[] };
export type OrderWithItems = { order: ShopOrder; items: ShopOrderItem[] };

async function variantsFor(productIds: string[]): Promise<Map<string, ShopVariant[]>> {
  const byProduct = new Map<string, ShopVariant[]>();
  if (!productIds.length) return byProduct;
  const vs = await db
    .select()
    .from(shopVariants)
    .where(inArray(shopVariants.productId, productIds))
    .orderBy(asc(shopVariants.sortOrder), asc(shopVariants.createdAt));
  for (const v of vs) {
    if (!byProduct.has(v.productId)) byProduct.set(v.productId, []);
    byProduct.get(v.productId)!.push(v);
  }
  return byProduct;
}

// Products (optionally only active) with their size variants.
export async function listProducts(activeOnly: boolean): Promise<ProductWithVariants[]> {
  const org = await getDefaultOrg();
  const where = org
    ? activeOnly
      ? and(eq(shopProducts.orgId, org.id), eq(shopProducts.active, true))
      : eq(shopProducts.orgId, org.id)
    : activeOnly
      ? eq(shopProducts.active, true)
      : undefined;
  const products = await (where ? db.select().from(shopProducts).where(where) : db.select().from(shopProducts))
    .orderBy(asc(shopProducts.category), asc(shopProducts.name));
  const byProduct = await variantsFor(products.map((p) => p.id));
  return products.map((product) => ({ product, variants: byProduct.get(product.id) ?? [] }));
}

export async function getProduct(id: string): Promise<ProductWithVariants | undefined> {
  const product = (await db.select().from(shopProducts).where(eq(shopProducts.id, id)))[0];
  if (!product) return undefined;
  const byProduct = await variantsFor([id]);
  return { product, variants: byProduct.get(id) ?? [] };
}

export async function getVariant(id: string): Promise<ShopVariant | undefined> {
  return (await db.select().from(shopVariants).where(eq(shopVariants.id, id)))[0];
}

export async function listOrders(limit = 500): Promise<OrderWithItems[]> {
  const org = await getDefaultOrg();
  const orders = await (org
    ? db.select().from(shopOrders).where(eq(shopOrders.orgId, org.id))
    : db.select().from(shopOrders))
    .orderBy(desc(shopOrders.createdAt))
    .limit(limit);
  if (!orders.length) return [];
  const items = await db
    .select()
    .from(shopOrderItems)
    .where(inArray(shopOrderItems.orderId, orders.map((o) => o.id)));
  const byOrder = new Map<string, ShopOrderItem[]>();
  for (const it of items) {
    if (!byOrder.has(it.orderId)) byOrder.set(it.orderId, []);
    byOrder.get(it.orderId)!.push(it);
  }
  return orders.map((order) => ({ order, items: byOrder.get(order.id) ?? [] }));
}

// Who receives order emails: every owner (admin emails) plus active directors.
export async function orderRecipients(): Promise<string[]> {
  const directors = await db
    .select({ email: employees.email, role: employees.role, status: employees.status })
    .from(employees);
  const dirEmails = directors
    .filter((d) => d.status === "active" && (d.role === "director" || d.role === "admin"))
    .map((d) => d.email)
    .filter(Boolean) as string[];
  return [...new Set([...adminEmails(), ...dirEmails])];
}
