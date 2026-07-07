import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import SiteHeader from "@/components/SiteHeader";
import { searchAudit } from "@/lib/audit";
import type { AuditEntry } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Audit Log — Crown Heirs Team Hub" };

function fmt(at: Date | null) {
  if (!at) return "";
  return new Date(at).toLocaleString("en-US", {
    timeZone: "America/Phoenix",
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ actor?: string; q?: string; since?: string; until?: string }>;
}) {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canSystem) redirect("/");

  const { actor = "", q = "", since = "", until = "" } = await searchParams;
  const filtering = !!(actor || q || since || until);

  let entries: AuditEntry[] = [];
  let setupNeeded = false;
  try {
    entries = await searchAudit({ actor, q, since, until, limit: 500 });
  } catch {
    setupNeeded = true;
  }

  const csvHref = `/api/admin/audit.csv?${new URLSearchParams({ actor, q, since, until }).toString()}`;

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Admin · Audit Log</div>
          <h1 className="title">Audit Log</h1>
          <p className="lede">A record of changes made across the system.</p>
        </div>

        {setupNeeded ? (
          <div className="notice">Run <strong>Admin → Set up / update database</strong> first.</div>
        ) : (
          <>
            <form method="get" className="card" style={{ cursor: "default", padding: "12px 14px", marginBottom: 16 }}>
              <div className="form-grid">
                <div className="field"><label htmlFor="actor">Who (email)</label><input id="actor" name="actor" defaultValue={actor} placeholder="anyone" /></div>
                <div className="field"><label htmlFor="q">Contains</label><input id="q" name="q" defaultValue={q} placeholder="action, item, or detail" /></div>
                <div className="field"><label htmlFor="since">From</label><input id="since" name="since" type="date" defaultValue={since} /></div>
                <div className="field"><label htmlFor="until">To</label><input id="until" name="until" type="date" defaultValue={until} /></div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button className="btn" type="submit">Filter</button>
                {filtering && <a className="btn btn-ghost" href="/admin/audit">Clear</a>}
                <span style={{ flex: 1 }} />
                <a className="btn btn-ghost" href={csvHref}>Export CSV</a>
              </div>
            </form>

            {entries.length === 0 ? (
              <p className="muted">{filtering ? "No matching activity." : "No activity recorded yet."}</p>
            ) : (
              <>
                <p className="muted" style={{ fontSize: "0.8rem" }}>Showing {entries.length} most recent{entries.length === 500 ? " (capped — narrow the filter for older)" : ""}.</p>
                <div style={{ overflowX: "auto" }}>
                  <table className="kpi-table">
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left" }}>When</th>
                        <th style={{ textAlign: "left" }}>Who</th>
                        <th style={{ textAlign: "left" }}>Action</th>
                        <th style={{ textAlign: "left" }}>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e) => (
                        <tr key={e.id}>
                          <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>{fmt(e.createdAt)}</td>
                          <td style={{ textAlign: "left" }}>{e.actorEmail ?? "—"}</td>
                          <td style={{ textAlign: "left" }}>{e.action} {e.entity}</td>
                          <td style={{ textAlign: "left" }}>{e.detail ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
