import Link from "next/link";
import { auth, signOut } from "@/auth";
import MobileNav from "@/components/MobileNav";
import { getEmployeeByEmail } from "@/lib/employees";
import { unreadTotal } from "@/lib/messages";

export default async function SiteHeader() {
  const session = await auth();
  const isAdmin = session?.user?.isAdmin;

  // Best-effort unread message count (DB may not be set up yet).
  let unread = 0;
  try {
    if (session?.user?.email) {
      const me = await getEmployeeByEmail(session.user.email);
      if (me) unread = await unreadTotal(me.id);
    }
  } catch {
    unread = 0;
  }

  return (
    <header className="site-header">
      <Link href="/" className="site-logo">Crown Heirs · Team Hub</Link>
      <MobileNav isAdmin={isAdmin} email={session?.user?.email} unread={unread} />
      <nav className="site-nav">
        <div className="nav-group">
          <button type="button" className="nav-top">Calendar ▾</button>
          <div className="nav-menu">
            <Link href="/calendar">Overview</Link>
            <Link href="/schedule">Schedule</Link>
            <Link href="/time-off">Time Off</Link>
          </div>
        </div>

        <div className="nav-group">
          <button type="button" className="nav-top">Training ▾</button>
          <div className="nav-menu">
            <Link href="/training">Videos &amp; Courses</Link>
            {isAdmin && <Link href="/training/dashboard">Completion Dashboard</Link>}
          </div>
        </div>

        <div className="nav-group">
          <button type="button" className="nav-top">Resources ▾</button>
          <div className="nav-menu">
            <Link href="/handbook">Handbook</Link>
            <Link href="/policies">Policies</Link>
            <Link href="/documents">Documents</Link>
          </div>
        </div>

        <div className="nav-group">
          <button type="button" className="nav-top">Team ▾</button>
          <div className="nav-menu">
            <Link href="/team">Directory</Link>
            <Link href="/messages">Messages{unread > 0 ? ` (${unread})` : ""}</Link>
            <Link href="/notes">Meeting Notes</Link>
            <Link href="/suggestions">Suggestion Box</Link>
          </div>
        </div>

        {isAdmin && <Link href="/admin" className="nav-top-link">Admin</Link>}

        {session?.user && (
          <>
            <Link href="/me" className="nav-top-link">My Profile</Link>
            <span className="who">{session.user.email}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button type="submit" className="btn-link">Sign out</button>
            </form>
          </>
        )}
      </nav>
    </header>
  );
}
