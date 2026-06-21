import { inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import SiteHeader from "@/components/SiteHeader";
import { db } from "@/lib/db";
import { ptoLedger } from "@/lib/db/schema";
import { getEmployeeByEmail, listEmployees } from "@/lib/employees";
import { balanceFor, ledgerFor } from "@/lib/pto";
import { addPtoEntry, deletePtoEntry } from "@/app/pto/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "PTO — Crown Heirs Team Hub" };

export default async function PtoPage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);

  let setupNeeded = false;
  let me;
  let myBalance = 0;
  let myLedger: typeof ptoLedger.$inferSelect[] = [];
  let roster: { id: string; fullName: string }[] = [];
  let teamBalances: { name: string; hours: number }[] = [];

  try {
    me = await getEmployeeByEmail(session?.user?.email ?? "");
    if (me) {
      myBalance = await balanceFor(me.id);
      myLedger = await ledgerFor(me.id);
    }
    if (access.canManageTeam) {
      const staff = await listEmployees();
      roster = staff.map((e) => ({ id: e.id, fullName: e.fullName }));
      if (staff.length) {
        const all = await db
          .select({ employeeId: ptoLedger.employeeId, h: ptoLedger.hours })
          .from(ptoLedger)
          .where(inArray(ptoLedger.employeeId, staff.map((s) => s.id)));
        const sums = new Map<string, number>();
        for (const r of all) sums.set(r.employeeId, (sums.get(r.employeeId) ?? 0) + Number(r.h));
        teamBalances = staff
          .map((s) => ({ name: s.fullName, hours: Math.round((sums.get(s.id) ?? 0) * 100) / 100 }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }
    }
  } catch {
    setupNeeded = true;
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">PTO</div>
          <h1 className="title">Paid Time Off</h1>
          <p className="lede">Your balance and history. Approved time off is deducted automatically.</p>
        </div>

        {setupNeeded ? (
          <div className="notice">Run <strong>Admin → Set up / update database</strong> first.</div>
        ) : !me ? (
          <div className="notice">You’re not on the team roster yet.</div>
        ) : (
          <>
            <div className="card" style={{ cursor: "default", textAlign: "center", padding: 24, marginBottom: 24 }}>
              <p className="muted" style={{ margin: 0 }}>Your PTO balance</p>
              <p style={{ fontFamily: "var(--font-serif)", fontSize: "2.4rem", margin: "4px 0", color: myBalance < 0 ? "#b3402f" : "var(--ink)" }}>
                {myBalance.toFixed(2)} hrs
              </p>
              <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>≈ {(myBalance / 8).toFixed(1)} days</p>
            </div>

            <div className="prose">
              <h2>History</h2>
              {myLedger.length === 0 ? (
                <p className="muted">No PTO activity yet.</p>
              ) : (
                <table className="kpi-table">
                  <thead><tr><th style={{ textAlign: "left" }}>Date</th><th style={{ textAlign: "left" }}>Type</th><th>Hours</th><th style={{ textAlign: "left" }}>Note</th></tr></thead>
                  <tbody>
                    {myLedger.map((l) => (
                      <tr key={l.id}>
                        <td style={{ textAlign: "left" }}>{l.effectiveDate ?? (l.createdAt ? new Date(l.createdAt).toISOString().slice(0, 10) : "")}</td>
                        <td style={{ textAlign: "left", textTransform: "capitalize" }}>{l.kind}</td>
                        <td style={{ color: Number(l.hours) < 0 ? "#b3402f" : "#1f5130" }}>{Number(l.hours) > 0 ? "+" : ""}{Number(l.hours)}</td>
                        <td style={{ textAlign: "left" }}>{l.note ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {access.canManageTeam && (
              <div style={{ marginTop: 36 }}>
                <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 600 }}>Team balances</h2>
                <table className="kpi-table" style={{ marginBottom: 24 }}>
                  <thead><tr><th style={{ textAlign: "left" }}>Staff</th><th>Balance (hrs)</th><th>Days</th></tr></thead>
                  <tbody>
                    {teamBalances.map((t) => (
                      <tr key={t.name}>
                        <td style={{ textAlign: "left" }}>{t.name}</td>
                        <td style={{ color: t.hours < 0 ? "#b3402f" : undefined }}>{t.hours.toFixed(2)}</td>
                        <td>{(t.hours / 8).toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <details className="prose">
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>Grant / adjust PTO</summary>
                  <form action={addPtoEntry} style={{ marginTop: 12 }}>
                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor="employeeId">Team member *</label>
                        <select id="employeeId" name="employeeId" required defaultValue="">
                          <option value="" disabled>Choose…</option>
                          {roster.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="hours">Hours (use − to deduct) *</label>
                        <input id="hours" name="hours" type="number" step="0.25" required placeholder="e.g. 40 or -8" />
                      </div>
                      <div className="field">
                        <label htmlFor="kind">Type</label>
                        <select id="kind" name="kind" defaultValue="grant">
                          <option value="grant">Grant (annual/initial)</option>
                          <option value="accrual">Accrual</option>
                          <option value="adjustment">Adjustment</option>
                          <option value="usage">Usage</option>
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="effectiveDate">Date</label>
                        <input id="effectiveDate" name="effectiveDate" type="date" />
                      </div>
                    </div>
                    <div className="field"><label htmlFor="note">Note</label><input id="note" name="note" placeholder="e.g. 2026 annual grant" /></div>
                    <button className="btn" type="submit">Apply</button>
                  </form>
                </details>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
