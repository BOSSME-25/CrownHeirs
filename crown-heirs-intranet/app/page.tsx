import Link from "next/link";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import { nextMeeting } from "@/lib/calendar";
import { getEmployeeByEmail } from "@/lib/employees";
import { getEmployeeKpis, type EmployeeKpi } from "@/lib/square";
import type { Meeting } from "@/lib/db/schema";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function fmtMeeting(m: Meeting) {
  const d = new Date(m.meetingDate + "T00:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC", weekday: "long", month: "short", day: "numeric",
  });
  let time = "";
  if (m.startTime) {
    const [h, mn] = m.startTime.split(":");
    let hr = parseInt(h, 10);
    const ap = hr >= 12 ? "PM" : "AM";
    hr = hr % 12 || 12;
    time = ` at ${hr}:${mn} ${ap}`;
  }
  return `${d}${time}`;
}

export default async function Home() {
  const session = await auth();
  const firstName = session?.user?.name?.split(" ")[0];
  const isAdmin = session?.user?.isAdmin;

  let meeting: Meeting | undefined;
  try {
    meeting = await nextMeeting(7);
  } catch {
    // calendar table not set up yet — no banner
  }

  // Personal KPIs for the signed-in staffer (if linked to Square).
  let myKpis: EmployeeKpi[] | undefined;
  const email = session?.user?.email;
  if (email) {
    try {
      const me = await getEmployeeByEmail(email);
      if (me?.squareTeamMemberId) {
        const r = await getEmployeeKpis(me.squareTeamMemberId);
        if (r.configured && "periods" in r) myKpis = r.periods;
      }
    } catch {
      // Square not set up or DB not migrated — just skip the section.
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        {meeting && (
          <div className="meeting-banner">
            <span style={{ fontSize: "1.2rem" }}>📅</span>
            <span>
              <strong>Upcoming:</strong> {meeting.title} — {fmtMeeting(meeting)}
              {meeting.location ? ` · ${meeting.location}` : ""}.{" "}
              {meeting.meetingUrl && (
                <a href={meeting.meetingUrl} target="_blank" rel="noopener noreferrer">Join video</a>
              )}{meeting.meetingUrl ? " · " : ""}
              <Link href="/calendar">See calendar</Link>
            </span>
          </div>
        )}
        <div className="page-head">
          <div className="eyebrow">Crown Heirs Team Hub</div>
          <h1 className="title">{firstName ? `Welcome, ${firstName}.` : "Welcome."}</h1>
          <p className="lede">
            Everything you need in one place — your handbook, our policies and
            procedures, and the training that keeps the Crown Heirs standard
            consistent across the team.
          </p>
        </div>

        {myKpis && (
          <section style={{ marginBottom: 36 }}>
            <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "1.4rem", margin: "0 0 14px" }}>
              Your numbers
            </h2>
            <div className="grid">
              {myKpis.map((p) => (
                <div className="card" key={p.label} style={{ cursor: "default" }}>
                  <h3>{p.label}</h3>
                  <p style={{ margin: "8px 0 2px" }}>
                    <span className="muted">Tips</span>{" "}
                    <strong style={{ fontFamily: "var(--font-serif)", fontSize: "1.5rem" }}>{money.format(p.tips)}</strong>
                  </p>
                  <p style={{ margin: "2px 0" }}>
                    <span className="muted">Clients</span> <strong>{p.clients}</strong>
                  </p>
                  <p style={{ margin: "2px 0" }}>
                    <span className="muted">Retention</span>{" "}
                    <strong>{p.retention === null ? "—" : `${Math.round(p.retention * 100)}%`}</strong>
                  </p>
                </div>
              ))}
            </div>
            <p className="muted" style={{ fontSize: "0.8rem", marginTop: 8 }}>
              Retention = share of your clients in the period who are repeat clients (2+ visits in the last 90 days).
            </p>
          </section>
        )}

        <div className="grid">
          <Link href="/schedule" className="card">
            <h3>Schedule</h3>
            <p>The weekly schedule — who’s working when. Admins build it; everyone sees it.</p>
            <span className="badge">View schedule →</span>
          </Link>
          <Link href="/calendar" className="card">
            <h3>Calendar</h3>
            <p>Upcoming meetings and team birthdays for the next 60 days.</p>
            <span className="badge">View calendar →</span>
          </Link>
          <Link href="/time-off" className="card">
            <h3>Time Off</h3>
            <p>Request days off and track approvals. Shift swaps live on each shift.</p>
            <span className="badge">Request time off →</span>
          </Link>
          <Link href="/team" className="card">
            <h3>Team</h3>
            <p>The staff roster — names, roles, contact info, and start dates.</p>
            <span className="badge">View team →</span>
          </Link>
          <Link href="/messages" className="card">
            <h3>Messages</h3>
            <p>Direct messages with your teammates.</p>
            <span className="badge">Open messages →</span>
          </Link>
          <Link href="/handbook" className="card">
            <h3>Employee Handbook</h3>
            <p>Who we are, how we work, expectations, schedules, pay, and benefits.</p>
            <span className="badge">Open handbook →</span>
          </Link>
          <Link href="/policies" className="card">
            <h3>Policies & Procedures</h3>
            <p>Salon policies, health & safety, client care, and day-to-day procedures.</p>
            <span className="badge">View policies →</span>
          </Link>
          <Link href="/training" className="card">
            <h3>Training</h3>
            <p>Onboarding, technique guides, product knowledge, and continuing education.</p>
            <span className="badge">Start training →</span>
          </Link>
          <Link href="/documents" className="card">
            <h3>All Documents</h3>
            <p>Browse and download every uploaded file across all categories.</p>
            <span className="badge">Browse files →</span>
          </Link>
          <Link href="/onboarding" className="card">
            <h3>Onboarding</h3>
            <p>Your getting-started checklist for new team members.</p>
            <span className="badge">View checklist →</span>
          </Link>
          <Link href="/acknowledgments" className="card">
            <h3>Acknowledgments</h3>
            <p>Review and sign off on company policies.</p>
            <span className="badge">Review policies →</span>
          </Link>
          <Link href="/reviews" className="card">
            <h3>Reviews</h3>
            <p>Your performance reviews and goals.</p>
            <span className="badge">View reviews →</span>
          </Link>
          {isAdmin && (
            <Link href="/admin" className="card">
              <h3>Admin</h3>
              <p>Upload documents, manage the team, and view business KPIs.</p>
              <span className="badge">Manage content →</span>
            </Link>
          )}
        </div>
      </main>
    </>
  );
}
