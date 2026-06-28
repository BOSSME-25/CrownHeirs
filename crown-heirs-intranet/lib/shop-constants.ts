// Team Shop — pure constants/helpers (no server-only deps).

export type ShopCategory = { id: string; label: string };

export const SHOP_CATEGORIES: ShopCategory[] = [
  { id: "scrubs", label: "Scrubs" },
  { id: "apparel", label: "Apparel" },
  { id: "merch", label: "Merchandise" },
  { id: "other", label: "Other" },
];

export const SHOP_CATEGORY_IDS = SHOP_CATEGORIES.map((c) => c.id);

export function shopCategoryLabel(id: string): string {
  return SHOP_CATEGORIES.find((c) => c.id === id)?.label ?? "Merchandise";
}
export function isShopCategory(id: string): boolean {
  return SHOP_CATEGORY_IDS.includes(id);
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// Price may be a string (numeric column) or null.
export function formatPrice(price: string | number | null | undefined): string {
  if (price == null || price === "") return "";
  const n = typeof price === "number" ? price : Number(price);
  if (!Number.isFinite(n)) return "";
  return money.format(n);
}

export function priceNumber(price: string | number | null | undefined): number | null {
  if (price == null || price === "") return null;
  const n = typeof price === "number" ? price : Number(price);
  return Number.isFinite(n) ? n : null;
}

// Parse a comma/newline separated list of size labels into a clean array.
export function parseSizes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
}
