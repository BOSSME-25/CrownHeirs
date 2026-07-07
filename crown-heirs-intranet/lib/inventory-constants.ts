// Pure inventory constants & helpers — no server-only deps, so this module
// is safe to import from client components. The DB-backed helpers live in
// lib/inventory.ts (which re-exports everything here).
import type { InventoryItem } from "@/lib/db/schema";

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

// Best-effort mapping of a free-text category (from a spreadsheet) onto one
// of our category ids. Falls back to the given default when nothing matches.
export function normalizeCategory(v: string | null | undefined, fallback = "retail"): string {
  if (!v) return fallback;
  const s = v.trim().toLowerCase();
  if (!s) return fallback;
  if (ITEM_CATEGORY_IDS.includes(s)) return s;
  const byLabel = ITEM_CATEGORIES.find((c) => c.label.toLowerCase() === s);
  if (byLabel) return byLabel.id;
  if (s.includes("retail") || s.includes("merch")) return "retail";
  if (s.includes("back") || s.includes("bar") || s.includes("pro")) return "backbar";
  if (s.includes("color") || s.includes("colour") || s.includes("tint")) return "color";
  if (s.includes("suppl") || s.includes("tool")) return "supplies";
  return fallback;
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
