import Link from "next/link";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import SiteHeader from "@/components/SiteHeader";
import DeleteShiftButton from "@/components/DeleteShiftButton";
import PublishWeekButton from "@/components/PublishWeekButton";
import { importSquareHours } from "@/app/schedule/actions";
import {
  activeEmployees,
  addDays,
  dayLabel,
  formatTime,
  rangeLabel,
  shiftsForWeek,
  todayYMD,
  weekStart,
  type ShiftWithEmployee,
} from "@/lib/schedule";

export const dynamic = "force-dynamic";
export const metadata = { title: "Schedule — Crown Heirs Team Hub" };

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const session = await auth();
  const admin = (await getAccess(session?.user?.email)).canApprove;
  const myEmail = session?.user?.email?.toLowerCase();

  const { week } = await searchParams;
  const ws = weekStart(week ?? todayYMD());
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const today = todayYMD();

  let shifts: ShiftWithEmployee[] = [];
  let setupNeeded = false;
  let roster: { id: string; fullName: string }[] = [];
  try {
    shifts = await shiftsForWeek(ws, admin);
    if (admin) roster = await activeEmployees();
  } catch {
    setupNeeded = true;
  }

  const byDay = (ymd: string) => shifts.filter((s) => s.shiftDate === ymd);
  const hasDrafts = admin && shifts.some((s) => !s.published);

  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ maxWidth: 1100 }}>
        <div className="page-head">
          <div className="eyebrow">Schedule</div>
          <h1 className="title">Weekly Schedule</h1>
        </div>

        {setupNeeded ? (
          <div className="notice">
            The schedule table isn’t set up yet. {admin
              ? "Go to Admin → “Set up / update database”, then come back."
              : "An admin needs to finish setup."}
          </div>
        ) : (
          <>
            <div className="week-nav">
              <Link className="btn btn-ghost" href={`/schedule?week=${addDays(ws, -7)}`}>← Prev</Link>
              <div className="week-range">
                {rangeLabel(ws)}
                <Link className="week-today" href="/schedule">This week</Link>
              </div>
              <Link className="btn btn-ghost" href={`/schedule?week=${addDays(ws, 7)}`}>Next →</Link>
            </div>

            {admin && (
              <div className="sched-actions">
                <Link className="btn" href={`/schedule/new?date=${today >= ws && today <= addDays(ws, 6) ? today : ws}`}>+ Add shift</Link>
                {hasDrafts && <PublishWeekButton weekStart={ws} />}
              </div>
            )}

            {admin && roster.length > 0 && (
              <details className="prose" style={{ margin: "4px 0 16px" }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>Import bookable hours from Square</summary>
                <form action={importSquareHours} style={{ marginTop: 12 }}>
                  <input type="hidden" name="weekStart" value={ws} />
                  <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
                    Creates <strong>draft</strong> shifts for the week of {rangeLabel(ws)} from your salon’s Square bookable hours,
                    for the stylists you pick. Days that already have a shift are skipped. Review and publish when ready.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", margin: "10px 0" }}>
                    {roster.map((e) => (
                      <label key={e.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="checkbox" name="employeeIds" value={e.id} /> {e.fullName}
                      </label>
                    ))}
                  </div>
                  <button className="btn" type="submit">Import draft shifts</button>
                </form>
              </details>
            )}

            <div className="week-grid">
              {days.map((ymd) => {
                const { dow, short } = dayLabel(ymd);
                const dayShifts = byDay(ymd);
                return (
                  <div className={`day-col${ymd === today ? " is-today" : ""}`} key={ymd}>
                    <div className="day-head">
                      <span className="day-dow">{dow}</span>
                      <span className="day-date">{short}</span>
                    </div>
                    <div className="day-body">
                      {dayShifts.length === 0 ? (
                        <p className="day-empty">—</p>
                      ) : (
                        dayShifts.map((s) => {
                          const mine = s.employeeEmail.toLowerCase() === myEmail;
                          return (
                            <div className={`shift-card${mine ? " mine" : ""}${!s.published ? " draft" : ""}`} key={s.id}>
                              <div className="shift-time">{formatTime(s.startTime)}–{formatTime(s.endTime)}</div>
                              <div className="shift-name">{s.employeeName}</div>
                              {s.position && <div className="shift-pos">{s.position}</div>}
                              {!s.published && <span className="shift-badge">Draft</span>}
                              {s.hasSwap && <span className="shift-badge swap">⇄ Swap</span>}
                              <Link href={`/schedule/${s.id}`} className="shift-duties">
                                {s.dutyTotal > 0 ? `✓ ${s.dutyDone}/${s.dutyTotal} duties` : "Duties"}
                              </Link>
                              {admin && (
                                <div className="shift-tools">
                                  <Link href={`/schedule/${s.id}/edit`} className="shift-edit">Edit</Link>
                                  <DeleteShiftButton id={s.id} />
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                      {admin && (
                        <Link className="day-add" href={`/schedule/new?date=${ymd}`}>+ Add</Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </>
  );
}
