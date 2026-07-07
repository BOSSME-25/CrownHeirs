import Link from "next/link";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import PrintButton from "@/components/PrintButton";
import { getAccess } from "@/lib/perms";
import {
  cadenceLabel,
  complianceState,
  COMPLIANCE_LEVELS,
  evidenceFor,
  listAttestations,
  listComplianceItems,
  prettyDate,
} from "@/lib/compliance";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compliance Report — Crown Heirs Team Hub" };

export default async function ComplianceReportPage() {
  const session = await auth();
  if (!(await getAccess(session?.user?.email)).canManageTeam) {
    return (
      <>
        <SiteHeader />
        <main className="wrap"><div className="notice">This report is for directors and owners.</div></main>
      </>
    );
  }

  const items = await listComplianceItems();
  const evidence = await evidenceFor(items.map((i) => i.id));
  const attestations = await listAttestations(1);
  const lastConfirmed = attestations.find((a) => a.confirmedAt);
  const generated = new Date().toLocaleString("en-US", { timeZone: "America/Phoenix", dateStyle: "long", timeStyle: "short" });

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="no-print" style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <Link className="btn btn-ghost" href="/admin/compliance">← Back</Link>
          <span style={{ flex: 1 }} />
          <a className="btn btn-ghost" href="/api/admin/compliance/report.csv">Export CSV</a>
          <PrintButton />
        </div>

        <div className="page-head">
          <div className="eyebrow">Crown Heirs · Compliance Report</div>
          <h1 className="title">Compliance Report</h1>
          <p className="lede">Generated {generated}.</p>
        </div>

        <p className="muted" style={{ fontSize: "0.85rem" }}>
          This report is an internal tracking record, not legal advice or a certification of compliance.
          {lastConfirmed ? (
            <> Last attested by <strong>{lastConfirmed.attestedBy}</strong> and confirmed by <strong>{lastConfirmed.confirmedBy}</strong> on {prettyDate(lastConfirmed.confirmedAt ? new Date(lastConfirmed.confirmedAt).toISOString().slice(0, 10) : null)}.</>
          ) : (
            <> No confirmed attestation on record yet.</>
          )}
        </p>

        {COMPLIANCE_LEVELS.map((lvl) => {
          const rows = items.filter((i) => i.level === lvl.id);
          if (rows.length === 0) return null;
          return (
            <section key={lvl.id} style={{ marginTop: 22 }}>
              <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "1.2rem", margin: "0 0 8px" }}>{lvl.label}</h2>
              <div style={{ overflowX: "auto" }}>
                <table className="kpi-table" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Requirement</th>
                      <th style={{ textAlign: "left" }}>Status</th>
                      <th style={{ textAlign: "left" }}>Due</th>
                      <th style={{ textAlign: "left" }}>Responsible</th>
                      <th style={{ textAlign: "left" }}>Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((i) => {
                      const s = complianceState({ status: i.status, dueAt: i.dueAt });
                      const ev = evidence.get(i.id) ?? [];
                      return (
                        <tr key={i.id}>
                          <td style={{ textAlign: "left" }}>
                            {i.title}
                            {i.needsVerification ? " (verify)" : ""}
                            <span className="muted" style={{ display: "block", fontSize: "0.78rem" }}>{cadenceLabel(i.cadence)}</span>
                          </td>
                          <td style={{ textAlign: "left" }}>{s.label}</td>
                          <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>{i.dueAt ? prettyDate(i.dueAt) : "—"}</td>
                          <td style={{ textAlign: "left" }}>{i.responsibleEmail ?? "—"}</td>
                          <td style={{ textAlign: "left" }}>{ev.length ? `${ev.length} item(s)` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </main>
    </>
  );
}
