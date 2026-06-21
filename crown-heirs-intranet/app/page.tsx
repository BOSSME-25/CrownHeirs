import Link from "next/link";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";

export default async function Home() {
  const session = await auth();
  const firstName = session?.user?.name?.split(" ")[0];
  const isAdmin = session?.user?.isAdmin;

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Crown Heirs Team Hub</div>
          <h1 className="title">{firstName ? `Welcome, ${firstName}.` : "Welcome."}</h1>
          <p className="lede">
            Everything you need in one place — your handbook, our policies and
            procedures, and the training that keeps the Crown Heirs standard
            consistent across the team.
          </p>
        </div>

        <div className="grid">
          <Link href="/schedule" className="card">
            <h3>Schedule</h3>
            <p>The weekly schedule — who’s working when. Admins build it; everyone sees it.</p>
            <span className="badge">View schedule →</span>
          </Link>
          <Link href="/team" className="card">
            <h3>Team</h3>
            <p>The staff roster — names, roles, contact info, and start dates.</p>
            <span className="badge">View team →</span>
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
          {isAdmin && (
            <Link href="/admin" className="card">
              <h3>Admin</h3>
              <p>Upload new documents and manage what the team can see.</p>
              <span className="badge">Manage content →</span>
            </Link>
          )}
        </div>
      </main>
    </>
  );
}
