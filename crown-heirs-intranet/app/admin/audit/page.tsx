import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import SiteHeader from "@/components/SiteHeader";
import { recentAudit } from "@/lib/audit";
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

export default async function AuditPage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canSystem) redirect("/");

  let entries: AuditEntry[] = [];
  let setupNeeded = false;
  try {
    entries = await recentAudit(300);
  } catch {
    setupNeeded = true;
  }

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
        ) : entries.length === 0 ? (
          <p className="muted">No activity recorded yet.</p>
        ) : (
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
        )}
      </main>
    </>
  );
}
