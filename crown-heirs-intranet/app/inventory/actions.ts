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
import { isItemCategory, normalizeCategory, TXN_REASON_IDS, num } from "@/lib/inventory";

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

// ── CSV import ──
export type ImportRow = {
  name?: string;
  brand?: string;
  category?: string;
  sku?: string;
  size?: string;
  unit?: string;
  cost?: string;
  retailPrice?: string;
  onHand?: string;
  reorderPoint?: string;
  vendorName?: string;
};
export type ImportResult = { created: number; updated: number; skipped: number; errors: string[] };

const parseNum = (s?: string) => {
  if (s == null) return null;
  const t = String(s).replace(/[$,\s]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

export async function importInventory(payload: {
  rows: ImportRow[];
  updateExisting: boolean;
  defaultCategory?: string;
}): Promise<ImportResult> {
  const actor = await requireManage();
  const org = await getDefaultOrg();
  const orgId = org?.id ?? null;
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  if (rows.length === 0) return result;

  const existing = orgId
    ? await db.select().from(inventoryItems).where(eq(inventoryItems.orgId, orgId))
    : await db.select().from(inventoryItems);
  const bySku = new Map<string, InventoryItem>();
  const byName = new Map<string, InventoryItem>();
  for (const it of existing) {
    if (it.sku) bySku.set(it.sku.trim().toLowerCase(), it);
    byName.set(it.name.trim().toLowerCase(), it);
  }

  const vendorRows = orgId
    ? await db.select().from(vendors).where(eq(vendors.orgId, orgId))
    : await db.select().from(vendors);
  const vendorByName = new Map<string, string>();
  for (const v of vendorRows) vendorByName.set(v.name.trim().toLowerCase(), v.id);

  async function ensureVendor(name?: string): Promise<string | null> {
    const n = name?.trim();
    if (!n) return null;
    const key = n.toLowerCase();
    const found = vendorByName.get(key);
    if (found) return found;
    const [v] = await db.insert(vendors).values({ orgId, name: n }).returning();
    vendorByName.set(key, v.id);
    return v.id;
  }

  const def = payload.defaultCategory ?? "retail";

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const name = (r.name ?? "").trim();
    if (!name) {
      result.skipped++;
      continue;
    }
    try {
      const cat = normalizeCategory(r.category, def);
      const vendorId = await ensureVendor(r.vendorName);
      const cost = parseNum(r.cost);
      const retail = parseNum(r.retailPrice);
      const reorder = parseNum(r.reorderPoint);
      const onHand = parseNum(r.onHand);
      const skuKey = r.sku?.trim().toLowerCase();
      const match = (skuKey ? bySku.get(skuKey) : undefined) ?? byName.get(name.toLowerCase());

      if (match) {
        if (!payload.updateExisting) {
          result.skipped++;
          continue;
        }
        await db
          .update(inventoryItems)
          .set({
            name,
            brand: r.brand?.trim() || match.brand,
            category: cat,
            sku: r.sku?.trim() || match.sku,
            size: r.size?.trim() || match.size,
            unit: r.unit?.trim() || match.unit,
            cost: cost != null ? String(cost) : match.cost,
            retailPrice: retail != null ? String(retail) : match.retailPrice,
            reorderPoint: reorder != null ? String(reorder) : match.reorderPoint,
            vendorId: vendorId ?? match.vendorId,
            updatedAt: new Date(),
          })
          .where(eq(inventoryItems.id, match.id));
        if (onHand != null) {
          const next = Math.max(0, onHand);
          const delta = next - num(match.onHand);
          await db.update(inventoryItems).set({ onHand: String(next) }).where(eq(inventoryItems.id, match.id));
          if (delta !== 0) {
            await db.insert(inventoryTxns).values({
              orgId,
              itemId: match.id,
              delta: String(delta),
              reason: "count",
              note: "CSV import",
              actorEmail: actor,
            });
          }
        }
        result.updated++;
      } else {
        const initial = onHand != null ? Math.max(0, onHand) : 0;
        const [row] = await db
          .insert(inventoryItems)
          .values({
            orgId,
            vendorId,
            name,
            brand: r.brand?.trim() || null,
            category: cat,
            sku: r.sku?.trim() || null,
            size: r.size?.trim() || null,
            unit: r.unit?.trim() || null,
            cost: cost != null ? String(cost) : null,
            retailPrice: retail != null ? String(retail) : null,
            onHand: String(initial),
            reorderPoint: String(reorder ?? 0),
          })
          .returning();
        if (row) {
          byName.set(name.toLowerCase(), row);
          if (row.sku) bySku.set(row.sku.trim().toLowerCase(), row);
          if (initial > 0) {
            await db.insert(inventoryTxns).values({
              orgId,
              itemId: row.id,
              delta: String(initial),
              reason: "count",
              note: "CSV import (starting count)",
              actorEmail: actor,
            });
          }
        }
        result.created++;
      }
    } catch (e) {
      result.errors.push(`Row ${i + 1} (${name}): ${(e as Error).message}`);
    }
  }

  await logAudit({
    actorEmail: actor,
    action: "import",
    entity: "inventory_item",
    detail: `${result.created} created, ${result.updated} updated, ${result.skipped} skipped`,
  });
  revalidatePath("/inventory");
  return result;
}
