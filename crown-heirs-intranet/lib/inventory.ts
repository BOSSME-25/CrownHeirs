import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { inventoryItems, inventoryTxns, vendors } from "@/lib/db/schema";
import type { InventoryItem, InventoryTxn, Vendor } from "@/lib/db/schema";
import { getDefaultOrg } from "@/lib/org";

export const ITEM_CATEGORIES = [
  { id: "retail", label: "Retail / Merchandise" },
  { id: "backbar", label: "Back Bar / Professional" },
  { id: "color", label: "Color" },
  { id: "supplies", label: "Supplies" },
] as const;
export const ITEM_CATEGORY_IDS = ITEM_CATEGORIES.map((c) => c.id) as string[];
export function isItemCategory(v: string): boolean {
  return ITEM_CATEGORY_IDS.includes(v);
}
export function categoryLabel(id: string): string {
  return ITEM_CATEGORIES.find((c) => c.id === id)?.label ?? "Item";
}

// Stock-movement reasons. Positive deltas add stock, negative remove it.
export const TXN_REASONS = [
  { id: "receive", label: "Received" },
  { id: "count", label: "Count correction" },
  { id: "adjust", label: "Adjustment" },
  { id: "usage", label: "Used (back bar)" },
  { id: "sale", label: "Sold" },
  { id: "waste", label: "Waste / loss" },
] as const;
export const TXN_REASON_IDS = TXN_REASONS.map((r) => r.id) as string[];
export function reasonLabel(id: string): string {
  return TXN_REASONS.find((r) => r.id === id)?.label ?? id;
}

// numeric columns come back as strings — parse safely.
export const num = (v: string | null | undefined): number => (v == null ? 0 : Number(v));

// An item is "low" only when a reorder point is set and on-hand has reached it.
export function isLow(item: Pick<InventoryItem, "onHand" | "reorderPoint">): boolean {
  const rp = num(item.reorderPoint);
  return rp > 0 && num(item.onHand) <= rp;
}

export async function listItems(): Promise<InventoryItem[]> {
  const org = await getDefaultOrg();
  if (org) {
    return db.select().from(inventoryItems).where(eq(inventoryItems.orgId, org.id)).orderBy(inventoryItems.name);
  }
  return db.select().from(inventoryItems).orderBy(inventoryItems.name);
}

export async function getItem(id: string): Promise<InventoryItem | undefined> {
  return (await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)))[0];
}

export async function getItemTxns(itemId: string, limit = 100): Promise<InventoryTxn[]> {
  return db
    .select()
    .from(inventoryTxns)
    .where(eq(inventoryTxns.itemId, itemId))
    .orderBy(desc(inventoryTxns.createdAt))
    .limit(limit);
}

export async function listVendors(includeInactive = false): Promise<Vendor[]> {
  const org = await getDefaultOrg();
  const rows = org
    ? await db.select().from(vendors).where(eq(vendors.orgId, org.id)).orderBy(vendors.name)
    : await db.select().from(vendors).orderBy(vendors.name);
  return includeInactive ? rows : rows.filter((v) => v.active);
}

export async function getVendor(id: string): Promise<Vendor | undefined> {
  return (await db.select().from(vendors).where(eq(vendors.id, id)))[0];
}
