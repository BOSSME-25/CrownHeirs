import Link from "next/link";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { getAccess } from "@/lib/perms";
import SiteHeader from "@/components/SiteHeader";
import DeleteMeetingButton from "@/components/DeleteMeetingButton";
import { addMeeting, decideMeetingRequest, requestMeeting } from "@/app/calendar/actions";
import { getEmployeeByEmail } from "@/lib/employees";
import { listPendingRequests } from "@/lib/meetingRequests";
import { monthEvents, upcomingEvents, type CalendarItem } from "@/lib/calendar";
import type { MeetingRequest } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar — Crown Heirs Team Hub" };

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtTime(hhmm: string) {
  const [h, m] = hhmm.split(":");
  let hr = parseInt(h, 10);
  const ap = hr >= 12 ? "PM" : "AM";
  hr = hr % 12 || 12;
  return `${hr}:${m} ${ap}`;
}
function icon(kind: CalendarItem["kind"]) {
  return kind === "birthday" ? "🎂" : kind === "timeoff" ? "🌴" : "📅";
}
function parts(ymd: string) {
  const d = new Date(ymd + "T00:00:00Z");
  return {
    day: d.getUTCDate(),
    mo: d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short" }),
    dow: d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" }),
  };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await auth();
  const admin = isAdmin(session?.user?.email);
  const canManage = (await getAccess(session?.user?.email)).canApprove;
  const { month } = await searchParams;

  // Signed-in employee + (for managers) the pending request queue.
  let onRoster = false;
  let pendingRequests: MeetingRequest[] = [];
  try {
    const meEmp = session?.user?.email ? await getEmployeeByEmail(session.user.email) : undefined;
    onRoster = !!meEmp;
    if (canManage) pendingRequests = await listPendingRequests();
  } catch {
    // tables not ready — skip request UI
  }

  // Today (in Arizona) and the month being viewed.
  const todayYmd = new Date().toLocaleDateString("en-CA", { timeZone: "America/Phoenix" });
  let year = Number(todayYmd.slice(0, 4));
  let month0 = Number(todayYmd.slice(5, 7)) - 1;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    year = Number(month.slice(0, 4));
    month0 = Number(month.slice(5, 7)) - 1;
  }

  let monthItems: CalendarItem[] = [];
  let upcoming: CalendarItem[] = [];
  let setupNeeded = false;
  try {
    [monthItems, upcoming] = await Promise.all([monthEvents(year, month0), upcomingEvents(45)]);
  } catch {
    setupNeeded = true;
  }

  // Group month items by date.
  const byDate = new Map<string, CalendarItem[]>();
  for (const it of monthItems) {
    const arr = byDate.get(it.date) ?? [];
    arr.push(it);
    byDate.set(it.date, arr);
  }

  const mm = String(month0 + 1).padStart(2, "0");
  const monthLabel = new Date(Date.UTC(year, month0, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC", month: "long", year: "numeric",
  });
  const prev = month0 === 0 ? `${year - 1}-12` : `${year}-${String(month0).padStart(2, "0")}`;
  const next = month0 === 11 ? `${year + 1}-01` : `${year}-${String(month0 + 2).padStart(2, "0")}`;
  const firstWeekday = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Calendar</div>
          <h1 className="title">Calendar</h1>
          <p className="lede">Meetings, birthdays, and who’s off — see the month and what’s coming up.</p>
        </div>

        {admin && !setupNeeded && (
          <details className="prose" style={{ marginBottom: 24 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>+ Add a meeting or event</summary>
            <form action={addMeeting} style={{ marginTop: 14 }}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="title">Title *</label>
                  <input id="title" name="title" required placeholder="e.g. All-staff meeting" />
                </div>
                <div className="field">
                  <label htmlFor="location">Location</label>
                  <input id="location" name="location" placeholder="Salon / Zoom / address" />
                </div>
                <div className="field">
                  <label htmlFor="meetingDate">Date *</label>
                  <input id="meetingDate" name="meetingDate" type="date" required />
                </div>
                <div className="field">
                  <label htmlFor="startTime">Time</label>
                  <input id="startTime" name="startTime" type="time" />
                </div>
                <div className="field">
                  <label htmlFor="meetingUrl">Video link (optional)</label>
                  <input id="meetingUrl" name="meetingUrl" placeholder="Google Meet / Zoom URL" />
                </div>
              </div>
              <div className="field">
                <label htmlFor="notes">Notes</label>
                <textarea id="notes" name="notes" rows={2} />
              </div>
              <button className="btn" type="submit">Add to calendar</button>
            </form>
          </details>
        )}

        {/* Stylist: request a 1:1 or meeting */}
        {onRoster && !setupNeeded && (
          <details className="prose" style={{ marginBottom: 20 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>+ Request a 1:1 or meeting</summary>
            <form action={requestMeeting} style={{ marginTop: 14 }}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="kind">Type</label>
                  <select id="kind" name="kind" defaultValue="one_on_one">
                    <option value="one_on_one">1:1 with management</option>
                    <option value="meeting">Meeting</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="preferredDate">Preferred date</label>
                  <input id="preferredDate" name="preferredDate" type="date" />
                </div>
                <div className="field">
                  <label htmlFor="preferredTime">Preferred time</label>
                  <input id="preferredTime" name="preferredTime" type="time" />
                </div>
              </div>
              <div className="field">
                <label htmlFor="reqNote">What’s it about? (optional)</label>
                <textarea id="reqNote" name="note" rows={2} />
              </div>
              <button className="btn" type="submit">Send request</button>
              <p className="muted" style={{ fontSize: "0.8rem", marginTop: 6 }}>This emails management; they’ll confirm a time with you.</p>
            </form>
          </details>
        )}

        {/* Management: pending requests */}
        {canManage && pendingRequests.length > 0 && (
          <div className="card" style={{ cursor: "default", marginBottom: 20, borderLeft: "3px solid var(--gold,#c8952a)" }}>
            <h3 style={{ marginTop: 0 }}>Meeting requests ({pendingRequests.length})</h3>
            {pendingRequests.map((r) => (
              <div key={r.id} style={{ borderTop: "1px solid var(--border,#e7ded5)", paddingTop: 10, marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ flex: 1, minWidth: 200 }}>
                  <strong>{r.requesterName}</strong> — {r.kind === "meeting" ? "meeting" : "1:1"}
                  {r.preferredDate ? ` · ${r.preferredDate}${r.preferredTime ? ` at ${r.preferredTime}` : ""}` : ""}
                  {r.note ? <span className="muted"> · “{r.note}”</span> : null}
                </span>
                <form action={decideMeetingRequest} style={{ display: "flex", gap: 6 }}>
                  <input type="hidden" name="requestId" value={r.id} />
                  <button className="btn" type="submit" name="decision" value="scheduled">Mark scheduled</button>
                  <button className="btn btn-ghost" type="submit" name="decision" value="declined">Decline</button>
                </form>
              </div>
            ))}
          </div>
        )}

        {setupNeeded ? (
          <div className="notice">
            The calendar isn’t set up yet. {admin
              ? "Go to Admin → “Set up / update database”, then come back."
              : "An admin needs to finish setup."}
          </div>
        ) : (
          <div className="cal-layout">
            {/* Month grid */}
            <section className="cal-cardish">
              <div className="cal-monthbar">
                <Link className="cal-nav" href={`/calendar?month=${prev}`} aria-label="Previous month">‹</Link>
                <h2 className="cal-monthlabel">{monthLabel}</h2>
                <Link className="cal-nav" href={`/calendar?month=${next}`} aria-label="Next month">›</Link>
              </div>
              <div className="cal-grid cal-grid-head">
                {WD.map((d) => <div key={d} className="cal-wd">{d}</div>)}
              </div>
              <div className="cal-grid">
                {cells.map((d, i) => {
                  if (d === null) return <div key={i} className="cal-cell cal-cell-empty" />;
                  const ds = `${year}-${mm}-${String(d).padStart(2, "0")}`;
                  const dayItems = byDate.get(ds) ?? [];
                  const isToday = ds === todayYmd;
                  return (
                    <div key={i} className={`cal-cell${isToday ? " cal-today" : ""}`}>
                      <div className="cal-daynum">{d}</div>
                      {dayItems.slice(0, 3).map((it, j) => (
                        <div key={j} className={`cal-chip cal-chip-${it.kind}`} title={it.title}>
                          {icon(it.kind)} {it.title}{it.time ? ` ${fmtTime(it.time)}` : ""}
                        </div>
                      ))}
                      {dayItems.length > 3 && <div className="cal-more">+{dayItems.length - 3} more</div>}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Upcoming side panel */}
            <aside className="cal-side">
              <h2 className="cal-side-title">Upcoming</h2>
              {upcoming.length === 0 ? (
                <p className="muted">Nothing in the next 45 days.</p>
              ) : (
                <div className="cal-side-list">
                  {upcoming.map((it, i) => {
                    const p = parts(it.date);
                    return (
                      <div className="cal-side-item" key={(it.id ?? "b") + i}>
                        <div className="cal-side-date">
                          <span className="d">{p.day}</span>
                          <span className="mo">{p.mo}</span>
                        </div>
                        <div className="cal-side-body">
                          <div className="cal-side-name">{icon(it.kind)} {it.title}</div>
                          <div className="cal-side-meta">
                            {p.dow}
                            {it.time ? ` · ${fmtTime(it.time)}` : ""}
                            {it.location ? ` · ${it.location}` : ""}
                            {it.notes ? ` · ${it.notes}` : ""}
                          </div>
                          {it.url && (
                            <a className="btn btn-ghost" href={it.url} target="_blank" rel="noopener noreferrer" style={{ marginTop: 6 }}>
                              Join video
                            </a>
                          )}
                          {admin && it.kind === "meeting" && it.id && (
                            <div style={{ marginTop: 6 }}>
                              <DeleteMeetingButton id={it.id} title={it.title} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </aside>
          </div>
        )}
      </main>
    </>
  );
}
