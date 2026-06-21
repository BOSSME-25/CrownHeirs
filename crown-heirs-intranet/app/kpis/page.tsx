import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import SiteHeader from "@/components/SiteHeader";
import { getKpis, getTeamKpis } from "@/lib/square";
import { listEmployees } from "@/lib/employees";

export const dynamic = "force-dynamic";
export const metadata = { title: "KPIs — Crown Heirs Team Hub" };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);

export default async function KpisPage() {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) redirect("/");

  const result = await getKpis();

  // Build the team leaderboard from employees linked to a Square profile.
  let linked: { teamMemberId: string; name: string }[] = [];
  try {
    linked = (await listEmployees())
      .filter((e) => e.squareTeamMemberId)
      .map((e) => ({ teamMemberId: e.squareTeamMemberId as string, name: e.fullName }));
  } catch {
    // DB not migrated yet — leaderboard just won't render.
  }
  const team = linked.length ? await getTeamKpis(linked) : null;

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">KPIs</div>
          <h1 className="title">Business Metrics</h1>
          <p className="lede">Sales performance from Square. Admins only.</p>
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

        {/* ── Team leaderboard ── */}
        <div className="page-head" style={{ marginTop: 48 }}>
          <h2 className="title" style={{ fontSize: "1.6rem" }}>Team Performance</h2>
          <p className="lede">Tips, clients, and repeat-client retention per stylist.</p>
        </div>

        {!team ? (
          <div className="notice">
            No employees are linked to Square yet. Go to <strong>Team → Edit</strong> and set each
            person’s <em>Square team member</em>.
          </div>
        ) : !team.configured ? (
          <div className="notice">Square isn’t connected yet.</div>
        ) : "error" in team ? (
          <div className="notice err">Couldn’t reach Square: {team.error}</div>
        ) : (
          team.periodLabels.map((label, pi) => {
            const rows = team.rows
              .map((r) => ({ name: r.name, ...r.periods[pi] }))
              .sort((a, b) => b.tips - a.tips);
            return (
              <div key={label} style={{ marginBottom: 28 }}>
                <h3 style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "1.2rem", margin: "0 0 8px" }}>
                  {label}
                </h3>
                <div style={{ overflowX: "auto" }}>
                  <table className="kpi-table">
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>Stylist</th>
                        <th>Tips</th>
                        <th>Clients</th>
                        <th>Retention</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.name}>
                          <td style={{ textAlign: "left" }}>{r.name}</td>
                          <td>{money.format(r.tips)}</td>
                          <td>{r.clients}</td>
                          <td>{pct(r.retention)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })
        )}
      </main>
    </>
  );
}
