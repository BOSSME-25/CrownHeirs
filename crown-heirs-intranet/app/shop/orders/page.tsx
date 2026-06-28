import Link from "next/link";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import { getAccess } from "@/lib/perms";
import { formatPrice, listOrders, priceNumber, type OrderWithItems } from "@/lib/shop";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team Shop Orders — Crown Heirs Team Hub" };

function when(d: Date | string | null) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function orderTotal(o: OrderWithItems): number {
  return o.items.reduce((s, it) => s + (priceNumber(it.unitPrice) ?? 0) * it.quantity, 0);
}

export default async function ShopOrdersPage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canApprove) {
    return (
      <>
        <SiteHeader />
        <main className="wrap">
          <div className="page-head">
            <div className="eyebrow">Team Shop</div>
            <h1 className="title">Orders</h1>
          </div>
          <div className="notice">This page is for managers and owners.</div>
        </main>
      </>
    );
  }

  let setupNeeded = false;
  let orders: OrderWithItems[] = [];
  try {
    orders = await listOrders();
  } catch {
    setupNeeded = true;
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Team Shop</div>
          <h1 className="title">Orders</h1>
          <p className="lede">Every order placed by the team. Export to CSV to compile and fulfill.</p>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          <Link className="btn btn-ghost" href="/shop">View shop</Link>
          <Link className="btn btn-ghost" href="/shop/manage">Manage products</Link>
          {orders.length > 0 && <a className="btn" href="/api/shop/orders.csv">Export CSV</a>}
        </div>

        {setupNeeded ? (
          <div className="notice">Run <strong>Admin → “Set up / update database”</strong> first.</div>
        ) : orders.length === 0 ? (
          <p className="muted">No orders yet.</p>
        ) : (
          orders.map(({ order, items }) => (
            <div key={order.id} className="card" style={{ cursor: "default", marginBottom: 10, padding: "14px 16px" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                <strong style={{ flex: 1, minWidth: 160 }}>{order.employeeName ?? "—"}</strong>
                <span className="muted" style={{ fontSize: "0.82rem" }}>{when(order.createdAt)}</span>
              </div>
              <div className="muted" style={{ fontSize: "0.82rem", marginBottom: 6 }}>{order.employeeEmail}</div>
              <ul style={{ margin: "6px 0", paddingLeft: 18 }}>
                {items.map((it) => (
                  <li key={it.id}>
                    {it.quantity} × {it.productName}
                    {it.variantLabel ? ` (${it.variantLabel})` : ""}
                    {it.unitPrice ? ` — ${formatPrice(it.unitPrice)} ea` : ""}
                  </li>
                ))}
              </ul>
              {order.note && <p className="muted" style={{ fontSize: "0.85rem", fontStyle: "italic", margin: "4px 0 0" }}>“{order.note}”</p>}
              {orderTotal({ order, items }) > 0 && (
                <div style={{ fontWeight: 600, marginTop: 6 }}>Total: {formatPrice(orderTotal({ order, items }))}</div>
              )}
            </div>
          ))
        )}
      </main>
    </>
  );
}
