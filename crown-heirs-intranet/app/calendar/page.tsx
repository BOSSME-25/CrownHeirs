import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import SiteHeader from "@/components/SiteHeader";
import DeleteMeetingButton from "@/components/DeleteMeetingButton";
import { addMeeting } from "@/app/calendar/actions";
import { upcomingEvents, type CalendarItem } from "@/lib/calendar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar — Crown Heirs Team Hub" };

function parts(ymd: string) {
  const d = new Date(ymd + "T00:00:00Z");
  return {
    day: d.getUTCDate(),
    mo: d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short" }),
    dow: d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" }),
  };
}
function fmtTime(hhmm: string) {
  const [h, m] = hhmm.split(":");
  let hr = parseInt(h, 10);
  const ap = hr >= 12 ? "PM" : "AM";
  hr = hr % 12 || 12;
  return `${hr}:${m} ${ap}`;
}

export default async function CalendarPage() {
  const session = await auth();
  const admin = isAdmin(session?.user?.email);

  let items: CalendarItem[] = [];
  let setupNeeded = false;
  try {
    items = await upcomingEvents(60);
  } catch {
    setupNeeded = true;
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Calendar</div>
          <h1 className="title">What’s Coming Up</h1>
          <p className="lede">Meetings, birthdays, and who’s off — for the next 60 days.</p>
        </div>

        {admin && !setupNeeded && (
          <form className="prose" action={addMeeting} style={{ marginBottom: 24 }}>
            <h2>Add a meeting or event</h2>
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
            </div>
            <div className="field">
              <label htmlFor="notes">Notes</label>
              <textarea id="notes" name="notes" rows={2} />
            </div>
            <button className="btn" type="submit">Add to calendar</button>
          </form>
        )}

        {setupNeeded ? (
          <div className="notice">
            The calendar isn’t set up yet. {admin
              ? "Go to Admin → “Set up / update database”, then come back."
              : "An admin needs to finish setup."}
          </div>
        ) : items.length === 0 ? (
          <p className="muted">Nothing scheduled in the next 60 days.</p>
        ) : (
          <div className="cal-list">
            {items.map((it, i) => {
              const p = parts(it.date);
              return (
                <div className="cal-item" key={(it.id ?? "b") + i}>
                  <div className="cal-date">
                    <div className="d">{p.day}</div>
                    <div className="mo">{p.mo}</div>
                  </div>
                  <div className="cal-body">
                    <div className="cal-title">
                      <span className="cal-ico">{it.kind === "birthday" ? "🎂" : it.kind === "timeoff" ? "🌴" : "📅"}</span> {it.title}
                    </div>
                    <div className="cal-meta">
                      {p.dow}
                      {it.time ? ` · ${fmtTime(it.time)}` : ""}
                      {it.location ? ` · ${it.location}` : ""}
                      {it.notes ? ` · ${it.notes}` : ""}
                    </div>
                  </div>
                  {admin && it.kind === "meeting" && it.id && (
                    <DeleteMeetingButton id={it.id} title={it.title} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
