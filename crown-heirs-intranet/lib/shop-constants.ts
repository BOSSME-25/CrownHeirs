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

export type StockMode = { id: string; label: string; hint: string };
export const STOCK_MODES: StockMode[] = [
  { id: "tracked", label: "In-stock (tracked)", hint: "Limited by the size stock counts; ordering reduces stock." },
  { id: "made_to_order", label: "Made to order", hint: "No stock kept — always orderable (e.g. scrubs)." },
];
export function isStockMode(id: string): boolean {
  return STOCK_MODES.some((m) => m.id === id);
}

export function paymentStatusLabel(method: string, status: string): string {
  if (status === "paid") return "Paid";
  if (status === "pending") return "Payment pending";
  if (method === "payroll") return "Owed (payroll / in person)";
  return "Unpaid";
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function dollarsToCents(price: string | number | null | undefined): number {
  const n = typeof price === "number" ? price : Number(price);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

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

// The image to show for a product: an uploaded photo (served via proxy) wins,
// else an external link, else nothing.
export function productImageSrc(p: { id: string; imageUrl?: string | null; imagePathname?: string | null }): string | null {
  if (p.imagePathname) return `/api/shop/image?id=${p.id}`;
  return p.imageUrl || null;
}

// Parse a comma/newline separated list of size labels into a clean array.
export function parseSizes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
}
