import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { inventoryItems, inventoryTxns, vendors } from "@/lib/db/schema";
import type { InventoryItem, InventoryTxn, Vendor } from "@/lib/db/schema";
import { getDefaultOrg } from "@/lib/org";

// Pure constants/helpers live in a client-safe module; re-export for callers
// that import everything from "@/lib/inventory".
export * from "@/lib/inventory-constants";

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
