import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import SiteHeader from "@/components/SiteHeader";
import { getKpis } from "@/lib/square";

export const dynamic = "force-dynamic";
export const metadata = { title: "KPIs — Crown Heirs Team Hub" };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default async function KpisPage() {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) redirect("/");

  const result = await getKpis();

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">KPIs</div>
          <h1 className="title">Business Metrics</h1>
          <p className="lede">Sales performance from Square.</p>
        </div>

        {!result.configured ? (
          <div className="notice">
            Square isn’t connected yet. Add <code>SQUARE_ACCESS_TOKEN</code> and{" "}
            <code>SQUARE_LOCATION_ID</code> in Vercel, then redeploy.
          </div>
        ) : "error" in result ? (
          <div className="notice err">Couldn’t reach Square: {result.error}</div>
        ) : (
          <div className="grid">
            {result.periods.map((p) => (
              <div className="card" key={p.label} style={{ cursor: "default" }}>
                <h3>{p.label}</h3>
                <p style={{ fontFamily: "var(--font-serif)", fontSize: "2rem", color: "var(--ink)", margin: "6px 0" }}>
                  {money.format(p.sales)}
                </p>
                <p className="muted">
                  {p.count} sales · avg {money.format(p.avg)}<br />
                  Tips: {money.format(p.tips)}
                </p>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
