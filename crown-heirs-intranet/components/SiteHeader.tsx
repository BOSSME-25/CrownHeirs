import Link from "next/link";
import { auth, signOut } from "@/auth";

export default async function SiteHeader() {
  const session = await auth();
  const isAdmin = session?.user?.isAdmin;

  return (
    <header className="site-header">
      <Link href="/" className="site-logo">Crown Heirs · Team Hub</Link>
      <nav className="site-nav">
        <Link href="/schedule">Schedule</Link>
        <Link href="/time-off">Time Off</Link>
        <Link href="/team">Team</Link>
        <Link href="/handbook">Handbook</Link>
        <Link href="/policies">Policies</Link>
        <Link href="/training">Training</Link>
        <Link href="/documents">Documents</Link>
        {isAdmin && <Link href="/admin">Admin</Link>}
        {session?.user && (
          <>
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
