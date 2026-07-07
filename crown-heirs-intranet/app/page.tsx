import Link from "next/link";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import CredentialBadge from "@/components/CredentialBadge";
import { nextMeeting } from "@/lib/calendar";
import { getEmployeeByEmail } from "@/lib/employees";
import { getAccess } from "@/lib/perms";
import { getEmployeeKpis, type EmployeeKpi } from "@/lib/square";
import { listAllCredentials, listCredentialsFor, type CredentialRow } from "@/lib/credentials";
import { credentialLabel, credentialState, prettyDate } from "@/lib/credentials-constants";
import StatusPill from "@/components/StatusPill";
import { listMyPolicies, listAssignments, ackState, policyCategoryLabel, type PolicyWithAck, type AssignmentRow } from "@/lib/policies";
import type { Credential, Meeting } from "@/lib/db/schema";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// Simple line-icon wrapper for the dashboard tiles.
const I = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

type Tile = { href: string; label: string; desc: string; icon: ReactNode; gold?: boolean };

const TILES: Tile[] = [
  { href: "/schedule", label: "Schedule", desc: "The weekly schedule — who’s working when.", icon: (
    <I><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4M8 13h2M14 13h2M8 17h2M14 17h2" /></I>
  ) },
  { href: "/timeclock", label: "Time Clock", desc: "Punch in and out and track your hours.", icon: (
    <I><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></I>
  ) },
  { href: "/calendar", label: "Calendar", desc: "Upcoming meetings and team birthdays.", icon: (
    <I><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /><circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none" /></I>
  ) },
  { href: "/duties", label: "Daily Duties", desc: "Opening & closing checklists and assigned roles.", icon: (
    <I><path d="M9 4h6a1 1 0 0 1 1 1v0a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v0a1 1 0 0 1 1-1z" /><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" /><path d="M8.5 12l2 2 4-4" /></I>
  ) },
  { href: "/time-off", label: "Time Off", desc: "Request days off and track approvals.", icon: (
    <I><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></I>
  ) },
  { href: "/pto", label: "PTO Balance", desc: "See your paid-time-off balance and history.", icon: (
    <I><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><circle cx="16.5" cy="14.5" r="1.2" fill="currentColor" stroke="none" /></I>
  ) },
  { href: "/team", label: "Team", desc: "The staff roster — names, roles, and contact info.", icon: (
    <I><circle cx="9" cy="8" r="3.2" /><circle cx="17" cy="9" r="2.4" /><path d="M2.5 19c0-3 2.6-5 6.5-5s6.5 2 6.5 5" /><path d="M16 14c2.7.2 5 1.9 5 4.5" /></I>
  ) },
  { href: "/messages", label: "Messages", desc: "Direct messages with your teammates.", icon: (
    <I><path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /></I>
  ) },
  { href: "/handbook", label: "Handbook", desc: "Who we are, how we work, pay, and benefits.", icon: (
    <I><path d="M12 6c-1.6-1-4.1-1.5-6-1.5V18c1.9 0 4.4.5 6 1.5 1.6-1 4.1-1.5 6-1.5V4.5c-1.9 0-4.4.5-6 1.5z" /><path d="M12 6v13.5" /></I>
  ) },
  { href: "/policies", label: "Policies", desc: "Salon policies, safety, and client care.", icon: (
    <I><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></I>
  ) },
  { href: "/training", label: "Training", desc: "Onboarding, techniques, and continuing education.", icon: (
    <I><path d="M12 4L2 9l10 5 10-5-10-5z" /><path d="M6 11v4c0 1.5 2.7 3 6 3s6-1.5 6-3v-4" /><path d="M22 9v5" /></I>
  ) },
  { href: "/documents", label: "Documents", desc: "Browse and download every uploaded file.", icon: (
    <I><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" /></I>
  ) },
  { href: "/inventory", label: "Inventory", desc: "Stock & merchandise — counts, reorders, history.", icon: (
    <I><path d="M3 8l9-5 9 5v8l-9 5-9-5V8z" /><path d="M3 8l9 5 9-5M12 13v8" /></I>
  ) },
  { href: "/shop", label: "Team Shop", desc: "Order scrubs and team merch — pick your size.", icon: (
    <I><path d="M6 2L3 6v14a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V6l-3-4z" /><path d="M3 6h18M16 10a4 4 0 0 1-8 0" /></I>
  ) },
  { href: "/onboarding", label: "Onboarding", desc: "Your getting-started checklist for new team members.", icon: (
    <I><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" /><path d="M9 13l2 2 4-4" /></I>
  ) },
  { href: "/acknowledgments", label: "Acknowledgments", desc: "Review and sign off on company policies.", icon: (
    <I><path d="M4 17l8-8 3 3-8 8H4v-3z" /><path d="M14 7l2-2 3 3-2 2" /></I>
  ) },
  { href: "/reviews", label: "Reviews", desc: "Your performance reviews and goals.", icon: (
    <I><path d="M12 3l2.6 5.5 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.5l1.1-6L3.4 9.3l6-.8L12 3z" /></I>
  ) },
];

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
  // Credential alerts: my own (within 90 days / pending), and — for managers —
  // everyone's that aren't current-and-complete yet.
  let myCredAlerts: Credential[] = [];
  let teamCredAlerts: CredentialRow[] = [];
  // Document / policy sign-offs.
  let myDocTodos: PolicyWithAck[] = [];
  let teamDocOutstanding = 0;
  let docConfirmQueue = 0;
  let canManage = false;
  const email = session?.user?.email;
  if (email) {
    try {
      const me = await getEmployeeByEmail(email);
      if (me?.squareTeamMemberId) {
        const r = await getEmployeeKpis(me.squareTeamMemberId);
        if (r.configured && "periods" in r) myKpis = r.periods;
      }
      if (me) {
        try {
          const mine = await listCredentialsFor(me.id);
          myCredAlerts = mine.filter((c) => credentialState({ status: c.status, expiresAt: c.expiresAt }).urgent);
        } catch {
          // credentials table not set up — skip
        }
        try {
          const docs = await listMyPolicies(me.id);
          myDocTodos = docs.filter((d) => ackState(d.ack, d.policy.version).needsEmployee);
        } catch {
          // policies table not set up — skip
        }
      }
    } catch {
      // Square not set up or DB not migrated — just skip the section.
    }
    try {
      canManage = (await getAccess(email)).canApprove;
      if (canManage) {
        try {
          const all = await listAllCredentials();
          teamCredAlerts = all.filter((r) => credentialState({ status: r.c.status, expiresAt: r.c.expiresAt }).urgent);
        } catch {
          // credentials table not set up — skip
        }
        try {
          const assignments: AssignmentRow[] = await listAssignments();
          teamDocOutstanding = assignments.filter((a) => !ackState(a.ack, a.policy.version).complete).length;
          docConfirmQueue = assignments.filter(
            (a) => ackState(a.ack, a.policy.version).needsManager && a.employeeEmail.toLowerCase() !== email.toLowerCase(),
          ).length;
        } catch {
          // policies table not set up — skip
        }
      }
    } catch {
      // perms unavailable — treat as staff
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

        {myCredAlerts.length > 0 && (
          <section className="card" style={{ cursor: "default", marginBottom: 24, borderLeft: "3px solid var(--gold,#c8a04a)" }}>
            <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "1.25rem", margin: "0 0 4px" }}>
              Your licenses &amp; certifications
            </h2>
            <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 12px" }}>
              These need attention. Upload your renewed certificate on <Link href="/me">My Profile</Link>.
            </p>
            {myCredAlerts.map((c) => {
              const s = credentialState({ status: c.status, expiresAt: c.expiresAt });
              return (
                <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "6px 0", borderTop: "1px solid var(--line,#e7ded5)" }}>
                  <span style={{ fontWeight: 600, flex: 1, minWidth: 160 }}>{credentialLabel(c.type)}</span>
                  <CredentialBadge s={s} />
                  <span className="muted" style={{ fontSize: "0.82rem" }}>
                    {c.expiresAt ? `Expires ${prettyDate(c.expiresAt)}` : "No date on file"}
                  </span>
                </div>
              );
            })}
          </section>
        )}

        {canManage && teamCredAlerts.length > 0 && (
          <section className="card" style={{ cursor: "default", marginBottom: 24, borderLeft: "3px solid var(--terra,#a0624a)" }}>
            <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "1.25rem", margin: "0 0 4px" }}>
              Team compliance ({teamCredAlerts.length})
            </h2>
            <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 12px" }}>
              Credentials that are due, expired, or awaiting review/confirmation. Manage on{" "}
              <Link href="/credentials">Licenses &amp; Certifications</Link>.
            </p>
            {teamCredAlerts.slice(0, 12).map((r) => {
              const s = credentialState({ status: r.c.status, expiresAt: r.c.expiresAt });
              return (
                <div key={r.c.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "6px 0", borderTop: "1px solid var(--line,#e7ded5)" }}>
                  <span style={{ fontWeight: 600, flex: 1, minWidth: 200 }}>
                    {r.employeeName} <span className="muted" style={{ fontWeight: 400 }}>· {credentialLabel(r.c.type)}</span>
                  </span>
                  <CredentialBadge s={s} />
                  <span className="muted" style={{ fontSize: "0.82rem" }}>
                    {r.c.expiresAt ? prettyDate(r.c.expiresAt) : "No date"}
                  </span>
                </div>
              );
            })}
            {teamCredAlerts.length > 12 && (
              <p className="muted" style={{ fontSize: "0.82rem", marginTop: 10, marginBottom: 0 }}>
                + {teamCredAlerts.length - 12} more on the <Link href="/credentials">Compliance page</Link>.
              </p>
            )}
          </section>
        )}

        {myDocTodos.length > 0 && (
          <section className="card" style={{ cursor: "default", marginBottom: 24, borderLeft: "3px solid var(--gold,#c8a04a)" }}>
            <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "1.25rem", margin: "0 0 4px" }}>
              Documents that need your signature
            </h2>
            <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 12px" }}>
              Read and sign these on <Link href="/acknowledgments">Acknowledgments</Link>.
            </p>
            {myDocTodos.map(({ policy }) => (
              <div key={policy.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "6px 0", borderTop: "1px solid var(--line,#e7ded5)" }}>
                <span style={{ fontWeight: 600, flex: 1, minWidth: 180 }}>
                  {policy.title}
                  <span className="muted" style={{ fontWeight: 400, fontSize: "0.8rem" }}> · {policyCategoryLabel(policy.category)}</span>
                </span>
                <StatusPill label="Needs your signature" tone="warn" />
              </div>
            ))}
          </section>
        )}

        {canManage && (teamDocOutstanding > 0 || docConfirmQueue > 0) && (
          <section className="card" style={{ cursor: "default", marginBottom: 24, borderLeft: "3px solid var(--terra,#a0624a)" }}>
            <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "1.25rem", margin: "0 0 4px" }}>
              Document sign-offs
            </h2>
            <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 4px" }}>
              {docConfirmQueue > 0 && (
                <>
                  <strong>{docConfirmQueue}</strong> sign-off{docConfirmQueue === 1 ? "" : "s"} waiting for your confirmation
                  {teamDocOutstanding > 0 ? " · " : ". "}
                </>
              )}
              {teamDocOutstanding > 0 && (
                <>
                  <strong>{teamDocOutstanding}</strong> still incomplete across the team.{" "}
                </>
              )}
              <Link href="/acknowledgments">Review on Acknowledgments →</Link>
            </p>
          </section>
        )}

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

        <div className="tiles">
          {TILES.map((t) => (
            <Link key={t.href} href={t.href} className="tile">
              <span className={"tile-icon" + (t.gold ? " gold" : "")}>{t.icon}</span>
              <span className="tile-label">{t.label}</span>
              <span className="tile-desc">{t.desc}</span>
            </Link>
          ))}
          {canManage && (
            <Link href="/credentials" className="tile">
              <span className="tile-icon gold">
                <I><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" /><path d="M9 11l2 2 4-4" /></I>
              </span>
              <span className="tile-label">Licenses &amp; Certs</span>
              <span className="tile-desc">Track state licensing, Barbicide, First Aid, CPR &amp; lifesaving.</span>
            </Link>
          )}
          {isAdmin && (
            <Link href="/admin" className="tile">
              <span className="tile-icon gold">
                <I><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" /></I>
              </span>
              <span className="tile-label">Admin</span>
              <span className="tile-desc">Upload documents, manage the team, and view KPIs.</span>
            </Link>
          )}
        </div>
      </main>
    </>
  );
}
