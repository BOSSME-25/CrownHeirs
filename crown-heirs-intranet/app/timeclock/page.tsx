import Link from "next/link";
import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import SiteHeader from "@/components/SiteHeader";
import { db } from "@/lib/db";
import { employees, timeEntries } from "@/lib/db/schema";
import { getEmployeeByEmail, listEmployees } from "@/lib/employees";
import { clockIn, clockOut, addManualEntry, deleteEntry } from "@/app/timeclock/actions";
import { azToday, weekStartOf, addDaysYmd, hoursOf, fmtAzTime, fmtAz, azDateOf } from "@/lib/timeclock";

export const dynamic = "force-dynamic";
export const metadata = { title: "Time Clock — Crown Heirs Team Hub" };

export default async function TimeClockPage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);

  const today = azToday();
  const weekStart = weekStartOf(today);
  const weekEnd = addDaysYmd(weekStart, 6);
  const weekStartInstant = new Date(`${weekStart}T00:00:00-07:00`);

  let setupNeeded = false;
  let me;
  let open;
  let myEntries: typeof timeEntries.$inferSelect[] = [];
  let team: { name: string; hours: number; open: boolean }[] = [];
  let teamEntries: (typeof timeEntries.$inferSelect & { who: string })[] = [];
  let roster: { id: string; fullName: string }[] = [];

  try {
    me = await getEmployeeByEmail(session?.user?.email ?? "");
    if (me) {
      open = (await db.select().from(timeEntries).where(and(eq(timeEntries.employeeId, me.id), isNull(timeEntries.clockOut))))[0];
      myEntries = await db
        .select()
        .from(timeEntries)
        .where(and(eq(timeEntries.employeeId, me.id), gte(timeEntries.clockIn, weekStartInstant)))
        .orderBy(asc(timeEntries.clockIn));
    }
    if (access.canApprove) {
      roster = (await listEmployees()).map((e) => ({ id: e.id, fullName: e.fullName }));
      const rows = await db
        .select({ t: timeEntries, who: employees.fullName })
        .from(timeEntries)
        .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
        .where(gte(timeEntries.clockIn, weekStartInstant))
        .orderBy(desc(timeEntries.clockIn));
      teamEntries = rows.map((r) => ({ ...r.t, who: r.who }));
      const byEmp = new Map<string, { hours: number; open: boolean }>();
      for (const r of rows) {
        const cur = byEmp.get(r.who) ?? { hours: 0, open: false };
        cur.hours += hoursOf(r.t);
        if (!r.t.clockOut) cur.open = true;
        byEmp.set(r.who, cur);
      }
      team = [...byEmp.entries()].map(([name, v]) => ({ name, hours: Math.round(v.hours * 100) / 100, open: v.open }))
        .sort((a, b) => b.hours - a.hours);
    }
  } catch {
    setupNeeded = true;
  }

  const myHours = Math.round(myEntries.reduce((s, e) => s + hoursOf(e), 0) * 100) / 100;

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Time Clock</div>
          <h1 className="title">Time Clock</h1>
          <p className="lede">Punch in and out. Week of {weekStart} – {weekEnd} (Arizona time).</p>
        </div>

        {setupNeeded ? (
          <div className="notice">Run <strong>Admin → Set up / update database</strong> first.</div>
        ) : !me ? (
          <div className="notice">You’re not on the team roster yet. Ask an admin to add you.</div>
        ) : (
          <>
            {/* Clock widget */}
            <div className="card" style={{ cursor: "default", textAlign: "center", padding: 24, marginBottom: 24 }}>
              {open ? (
                <>
                  <p style={{ margin: "0 0 4px", color: "#1f5130", fontWeight: 600 }}>● Clocked in</p>
                  <p className="muted" style={{ marginTop: 0 }}>since {fmtAzTime(open.clockIn)}</p>
                  <form action={clockOut} style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                    <label className="muted" style={{ fontSize: "0.85rem" }}>
                      Break (min): <input name="breakMinutes" type="number" min="0" defaultValue="0" style={{ width: 70 }} />
                    </label>
                    <button className="btn" type="submit">Clock out</button>
                  </form>
                </>
              ) : (
                <form action={clockIn}>
                  <p className="muted" style={{ marginTop: 0 }}>You’re clocked out.</p>
                  <button className="btn" type="submit" style={{ fontSize: "1.05rem", padding: "12px 28px" }}>Clock in</button>
                </form>
              )}
              <p style={{ marginTop: 16, marginBottom: 0 }}>
                This week: <strong>{myHours.toFixed(2)} hrs</strong>
                {myHours > 40 && <span className="badge" style={{ marginLeft: 8, background: "#fbeede", color: "#8a5a17" }}>OT: {(myHours - 40).toFixed(2)} hr</span>}
              </p>
            </div>

            {/* My entries this week */}
            <div className="prose">
              <h2>My entries this week</h2>
              {myEntries.length === 0 ? (
                <p className="muted">No punches yet this week.</p>
              ) : (
                <table className="kpi-table">
                  <thead><tr><th style={{ textAlign: "left" }}>Day</th><th>In</th><th>Out</th><th>Break</th><th>Hours</th></tr></thead>
                  <tbody>
                    {myEntries.map((e) => (
                      <tr key={e.id}>
                        <td style={{ textAlign: "left" }}>{azDateOf(e.clockIn)}</td>
                        <td>{fmtAzTime(e.clockIn)}</td>
                        <td>{e.clockOut ? fmtAzTime(e.clockOut) : "—"}</td>
                        <td>{e.breakMinutes}m</td>
                        <td>{e.clockOut ? hoursOf(e).toFixed(2) : "open"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Manager view */}
            {access.canApprove && (
              <div style={{ marginTop: 36 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 600 }}>Team hours this week</h2>
                  <a className="btn btn-ghost" href={`/api/timeclock/export?from=${weekStart}&to=${weekEnd}`}>⬇ Export payroll CSV</a>
                </div>
                {team.length === 0 ? (
                  <p className="muted">No punches recorded this week.</p>
                ) : (
                  <table className="kpi-table" style={{ marginBottom: 24 }}>
                    <thead><tr><th style={{ textAlign: "left" }}>Staff</th><th>Hours</th><th>Status</th></tr></thead>
                    <tbody>
                      {team.map((t) => (
                        <tr key={t.name}>
                          <td style={{ textAlign: "left" }}>{t.name}</td>
                          <td>{t.hours.toFixed(2)}{t.hours > 40 ? " ⚠️" : ""}</td>
                          <td>{t.open ? "Clocked in" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

                <details className="prose">
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>Add a manual entry / correction</summary>
                  <form action={addManualEntry} style={{ marginTop: 12 }}>
                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor="employeeId">Team member *</label>
                        <select id="employeeId" name="employeeId" required defaultValue="">
                          <option value="" disabled>Choose…</option>
                          {roster.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                        </select>
                      </div>
                      <div className="field"><label htmlFor="date">Date *</label><input id="date" name="date" type="date" required defaultValue={today} /></div>
                      <div className="field"><label htmlFor="startTime">In *</label><input id="startTime" name="startTime" type="time" required /></div>
                      <div className="field"><label htmlFor="endTime">Out *</label><input id="endTime" name="endTime" type="time" required /></div>
                      <div className="field"><label htmlFor="breakMinutes">Break (min)</label><input id="breakMinutes" name="breakMinutes" type="number" min="0" defaultValue="0" /></div>
                    </div>
                    <div className="field"><label htmlFor="note">Note</label><input id="note" name="note" placeholder="Reason for correction" /></div>
                    <button className="btn" type="submit">Add entry</button>
                  </form>
                </details>

                <details className="prose" style={{ marginTop: 16 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>All entries this week ({teamEntries.length})</summary>
                  <table className="kpi-table" style={{ marginTop: 12 }}>
                    <thead><tr><th style={{ textAlign: "left" }}>Staff</th><th style={{ textAlign: "left" }}>In</th><th style={{ textAlign: "left" }}>Out</th><th>Hrs</th><th></th></tr></thead>
                    <tbody>
                      {teamEntries.map((e) => (
                        <tr key={e.id}>
                          <td style={{ textAlign: "left" }}>{e.who}</td>
                          <td style={{ textAlign: "left" }}>{fmtAz(e.clockIn)}</td>
                          <td style={{ textAlign: "left" }}>{e.clockOut ? fmtAz(e.clockOut) : "open"}</td>
                          <td>{e.clockOut ? hoursOf(e).toFixed(2) : "—"}</td>
                          <td>
                            <form action={deleteEntry.bind(null, e.id)}>
                              <button className="btn btn-ghost" type="submit" style={{ fontSize: "0.72rem" }}>Delete</button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
