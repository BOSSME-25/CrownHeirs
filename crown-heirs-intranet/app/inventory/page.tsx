import Link from "next/link";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import { getAccess } from "@/lib/perms";
import { ITEM_CATEGORIES, categoryLabel, isLow, listItems, num } from "@/lib/inventory";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventory — Crown Heirs Team Hub" };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string; low?: string }>;
}) {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  const canManage = access.canApprove;
  const { cat, low } = await searchParams;

  let items: Awaited<ReturnType<typeof listItems>> = [];
  let setupNeeded = false;
  try {
    items = await listItems();
  } catch {
    setupNeeded = true;
  }

  const active = items.filter((i) => i.active);
  const lowItems = active.filter(isLow);
  const invValue = active.reduce((sum, i) => sum + num(i.onHand) * num(i.cost), 0);

  let shown = active;
  if (cat && cat !== "all") shown = shown.filter((i) => i.category === cat);
  if (low === "1") shown = shown.filter(isLow);

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Inventory</div>
          <h1 className="title">Stock &amp; Merchandise</h1>
          <p className="lede">
            Track retail products and back-bar supplies — on-hand counts, reorder
            points, receiving, and a full history of every change.
          </p>
        </div>

        {setupNeeded ? (
          <div className="notice">The database isn’t set up yet. Run <strong>Admin → Set up / update database</strong> first.</div>
        ) : (
          <>
            <div className="stat-row">
              <div className="stat">
                <div className="stat-label">Active items</div>
                <div className="stat-value">{active.length}</div>
              </div>
              <Link href="/inventory?low=1" className="stat" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="stat-label">Low / reorder</div>
                <div className="stat-value" style={{ color: lowItems.length ? "var(--terra)" : undefined }}>{lowItems.length}</div>
              </Link>
              <div className="stat">
                <div className="stat-label">Inventory value (cost)</div>
                <div className="stat-value">{money.format(invValue)}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
              <Link href="/inventory" className={`tag${!cat && low !== "1" ? " ok" : ""}`}>All</Link>
              {ITEM_CATEGORIES.map((c) => (
                <Link key={c.id} href={`/inventory?cat=${c.id}`} className={`tag${cat === c.id ? " ok" : ""}`}>{c.label}</Link>
              ))}
              <Link href="/inventory?low=1" className={`tag${low === "1" ? " low" : ""}`}>Low only</Link>
              <span style={{ flex: 1 }} />
              {canManage && (
                <>
                  <Link href="/inventory/vendors" className="btn btn-ghost">Vendors</Link>
                  <Link href="/inventory/new" className="btn">Add item</Link>
                </>
              )}
            </div>

            {shown.length === 0 ? (
              <div className="notice">
                {active.length === 0
                  ? "No items yet."
                  : "Nothing matches this filter."}
                {canManage && active.length === 0 && <> Use <strong>Add item</strong> to start your inventory.</>}
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th className="num">On hand</th>
                    <th className="num">Reorder at</th>
                    <th>Status</th>
                    <th className="num">Retail</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((i) => {
                    const lowFlag = isLow(i);
                    return (
                      <tr key={i.id}>
                        <td>
                          <Link href={`/inventory/${i.id}`}>{i.name}</Link>
                          {i.brand && <span className="muted"> · {i.brand}</span>}
                          {i.size && <span className="muted"> · {i.size}</span>}
                        </td>
                        <td><span className="tag">{categoryLabel(i.category)}</span></td>
                        <td className="num">{qty(num(i.onHand))}{i.unit ? ` ${i.unit}` : ""}</td>
                        <td className="num">{num(i.reorderPoint) > 0 ? qty(num(i.reorderPoint)) : "—"}</td>
                        <td>{lowFlag ? <span className="tag low">Reorder</span> : <span className="tag ok">In stock</span>}</td>
                        <td className="num">{i.retailPrice ? money.format(num(i.retailPrice)) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </main>
    </>
  );
}
