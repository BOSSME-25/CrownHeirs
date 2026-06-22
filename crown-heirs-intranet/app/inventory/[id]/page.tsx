import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import { getAccess } from "@/lib/perms";
import {
  categoryLabel, getItem, getItemTxns, getVendor, isLow, num, reasonLabel, TXN_REASONS,
} from "@/lib/inventory";
import { receiveStock, adjustStock, setCount, setItemActive } from "@/app/inventory/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Item — Inventory" };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

function when(d: Date | null) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  const canManage = access.canApprove;
  const { id } = await params;

  const item = await getItem(id);
  if (!item) notFound();
  const [txns, vendor] = await Promise.all([
    getItemTxns(id),
    item.vendorId ? getVendor(item.vendorId) : Promise.resolve(undefined),
  ]);

  const onHand = num(item.onHand);
  const low = isLow(item);
  const archive = setItemActive.bind(null, id, false);
  const reactivate = setItemActive.bind(null, id, true);

  // Adjustment reasons that remove stock (the common day-to-day cases).
  const removeReasons = TXN_REASONS.filter((r) => ["usage", "sale", "waste", "adjust"].includes(r.id));

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow"><Link href="/inventory">Inventory</Link> · {categoryLabel(item.category)}</div>
          <h1 className="title">{item.name}{!item.active && <span className="muted"> (archived)</span>}</h1>
          <p className="lede">
            {[item.brand, item.size, item.sku && `SKU ${item.sku}`].filter(Boolean).join(" · ") || " "}
          </p>
        </div>

        <div className="stat-row">
          <div className="stat">
            <div className="stat-label">On hand</div>
            <div className="stat-value" style={{ color: low ? "var(--terra)" : undefined }}>
              {qty(onHand)}{item.unit ? ` ${item.unit}` : ""}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">Status</div>
            <div className="stat-value" style={{ fontSize: "1.1rem", paddingTop: 8 }}>
              {low ? <span className="tag low">Reorder</span> : <span className="tag ok">In stock</span>}
              {num(item.reorderPoint) > 0 && <span className="muted"> at {qty(num(item.reorderPoint))}</span>}
            </div>
          </div>
          {item.retailPrice && (
            <div className="stat">
              <div className="stat-label">Retail</div>
              <div className="stat-value">{money.format(num(item.retailPrice))}</div>
            </div>
          )}
          {item.cost && (
            <div className="stat">
              <div className="stat-label">Cost · value</div>
              <div className="stat-value">{money.format(num(item.cost) * onHand)}</div>
            </div>
          )}
        </div>

        {(vendor || item.notes) && (
          <p className="muted" style={{ marginBottom: 18 }}>
            {vendor && <>Vendor: <strong>{vendor.name}</strong>{vendor.phone ? ` · ${vendor.phone}` : ""}. </>}
            {item.notes}
          </p>
        )}

        {canManage && item.active && (
          <div className="grid" style={{ marginBottom: 28 }}>
            <form action={receiveStock} className="card" style={{ cursor: "default" }}>
              <input type="hidden" name="itemId" value={id} />
              <h3>Receive stock</h3>
              <div className="field"><label htmlFor="r-qty">Quantity received</label>
                <input id="r-qty" name="qty" type="number" step="1" min="1" required /></div>
              <div className="field"><label htmlFor="r-cost">Unit cost (optional)</label>
                <input id="r-cost" name="unitCost" type="number" step="0.01" placeholder="0.00" /></div>
              <div className="field"><label htmlFor="r-note">Note (optional)</label>
                <input id="r-note" name="note" placeholder="PO #, invoice…" /></div>
              <button className="btn" type="submit">Add to stock</button>
            </form>

            <form action={adjustStock} className="card" style={{ cursor: "default" }}>
              <input type="hidden" name="itemId" value={id} />
              <input type="hidden" name="direction" value="remove" />
              <h3>Remove / adjust</h3>
              <div className="field"><label htmlFor="a-amt">Amount</label>
                <input id="a-amt" name="amount" type="number" step="1" min="1" required /></div>
              <div className="field"><label htmlFor="a-reason">Reason</label>
                <select id="a-reason" name="reason" defaultValue="usage">
                  {removeReasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select></div>
              <div className="field"><label htmlFor="a-note">Note (optional)</label>
                <input id="a-note" name="note" /></div>
              <button className="btn" type="submit">Remove from stock</button>
            </form>

            <form action={setCount} className="card" style={{ cursor: "default" }}>
              <input type="hidden" name="itemId" value={id} />
              <h3>Set physical count</h3>
              <p className="muted" style={{ margin: "0 0 8px" }}>Counted the shelf? Enter the actual number and we’ll record the correction.</p>
              <div className="field"><label htmlFor="c-qty">Counted quantity</label>
                <input id="c-qty" name="counted" type="number" step="1" min="0" required /></div>
              <div className="field"><label htmlFor="c-note">Note (optional)</label>
                <input id="c-note" name="note" placeholder="Monthly count" /></div>
              <button className="btn" type="submit">Record count</button>
            </form>
          </div>
        )}

        {canManage && (
          <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
            <Link href={`/inventory/${id}/edit`} className="btn btn-ghost">Edit details</Link>
            {item.active ? (
              <form action={archive}><button className="btn btn-ghost" type="submit">Archive item</button></form>
            ) : (
              <form action={reactivate}><button className="btn btn-ghost" type="submit">Reactivate</button></form>
            )}
          </div>
        )}

        <h2 className="title" style={{ fontSize: "1.4rem" }}>History</h2>
        {txns.length === 0 ? (
          <div className="notice">No stock movements yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>When</th><th>Change</th><th>Reason</th><th>Note</th><th>By</th></tr>
            </thead>
            <tbody>
              {txns.map((t) => {
                const d = num(t.delta);
                return (
                  <tr key={t.id}>
                    <td>{when(t.createdAt)}</td>
                    <td className="num" style={{ color: d < 0 ? "var(--terra)" : "#2f6b3c", fontVariantNumeric: "tabular-nums" }}>
                      {d > 0 ? `+${qty(d)}` : qty(d)}
                    </td>
                    <td>{reasonLabel(t.reason)}</td>
                    <td>{t.note ?? ""}{t.unitCost ? ` · ${money.format(num(t.unitCost))}/unit` : ""}</td>
                    <td className="muted">{t.actorEmail?.split("@")[0] ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}
