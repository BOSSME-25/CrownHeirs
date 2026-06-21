import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import SiteHeader from "@/components/SiteHeader";
import TimeOffDecision from "@/components/TimeOffDecision";
import { submitTimeOff } from "@/app/time-off/actions";
import { getEmployeeByEmail } from "@/lib/employees";
import { listAllTimeOff, listMyTimeOff, TIME_OFF_TYPES, timeOffTypeLabel } from "@/lib/requests";

export const dynamic = "force-dynamic";
export const metadata = { title: "Time Off — Crown Heirs Team Hub" };

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge ${status}`}>{status}</span>;
}

function fmt(ymd: string) {
  const d = new Date(ymd + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

export default async function TimeOffPage() {
  const session = await auth();
  const admin = isAdmin(session?.user?.email);
  const email = session?.user?.email ?? "";

  let setupNeeded = false;
  let employee;
  let mine: Awaited<ReturnType<typeof listMyTimeOff>> = [];
  let all: Awaited<ReturnType<typeof listAllTimeOff>> = [];
  try {
    employee = await getEmployeeByEmail(email);
    if (employee) mine = await listMyTimeOff(employee.id);
    if (admin) all = await listAllTimeOff();
  } catch {
    setupNeeded = true;
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Time Off</div>
          <h1 className="title">Time-Off Requests</h1>
          <p className="lede">Request days off and track where your requests stand.</p>
        </div>

        {setupNeeded ? (
          <div className="notice">
            The time-off table isn’t set up yet. {admin
              ? "Go to Admin → “Set up / update database”, then come back."
              : "An admin needs to finish setup."}
          </div>
        ) : (
          <>
            {/* Request form */}
            {employee ? (
              <form className="prose" action={submitTimeOff}>
                <h2>Request time off</h2>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="startDate">Start date *</label>
                    <input id="startDate" name="startDate" type="date" required />
                  </div>
                  <div className="field">
                    <label htmlFor="endDate">End date *</label>
                    <input id="endDate" name="endDate" type="date" required />
                  </div>
                  <div className="field">
                    <label htmlFor="type">Type</label>
                    <select id="type" name="type">
                      <option value="">—</option>
                      {TIME_OFF_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="note">Note (optional)</label>
                  <textarea id="note" name="note" rows={2} />
                </div>
                <button className="btn" type="submit">Submit request</button>
              </form>
            ) : (
              <div className="notice">
                You’re not on the team roster yet, so you can’t submit requests. Ask an admin to add you under Team.
              </div>
            )}

            {/* Admin: all requests */}
            {admin && (
              <>
                <h2 className="title" style={{ fontSize: "1.4rem", marginTop: 36 }}>All requests</h2>
                {all.length === 0 ? (
                  <p className="muted">No requests yet.</p>
                ) : (
                  <div className="req-list">
                    {all.map((r) => (
                      <div className="req" key={r.id}>
                        <div>
                          <div className="req-title">{r.employeeName} · {timeOffTypeLabel(r.type)}</div>
                          <div className="req-meta">{fmt(r.startDate)} – {fmt(r.endDate)}{r.note ? ` · ${r.note}` : ""}</div>
                        </div>
                        <div className="req-right">
                          <StatusBadge status={r.status} />
                          {r.status === "pending" && <TimeOffDecision id={r.id} />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Everyone: my requests */}
            {employee && (
              <>
                <h2 className="title" style={{ fontSize: "1.4rem", marginTop: 36 }}>My requests</h2>
                {mine.length === 0 ? (
                  <p className="muted">You haven’t requested any time off yet.</p>
                ) : (
                  <div className="req-list">
                    {mine.map((r) => (
                      <div className="req" key={r.id}>
                        <div>
                          <div className="req-title">{timeOffTypeLabel(r.type)}</div>
                          <div className="req-meta">{fmt(r.startDate)} – {fmt(r.endDate)}{r.note ? ` · ${r.note}` : ""}</div>
                        </div>
                        <StatusBadge status={r.status} />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
