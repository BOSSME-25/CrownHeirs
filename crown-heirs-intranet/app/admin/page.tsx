import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import AdminPanel from "@/components/AdminPanel";
import InitDbButton from "@/components/InitDbButton";

export const metadata = { title: "Admin — Crown Heirs Team Hub" };

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!session.user.isAdmin) redirect("/");

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Admin</div>
          <h1 className="title">Manage Documents</h1>
          <p className="lede">
            Upload handbooks, policies, and training materials. Choose a category
            so each file shows up in the right section for the team.
          </p>
        </div>
        <div className="grid" style={{ marginBottom: 28 }}>
          <Link href="/kpis" className="card">
            <h3>Business KPIs</h3>
            <p>Salon-wide sales, tips, transaction count, and average ticket from Square. Admins only.</p>
            <span className="badge">View KPIs →</span>
          </Link>
          <Link href="/admin/locations" className="card">
            <h3>Locations</h3>
            <p>Manage the salon locations staff, schedules, and KPIs are scoped to.</p>
            <span className="badge">Manage locations →</span>
          </Link>
        </div>
        <InitDbButton />
        <AdminPanel />
      </main>
    </>
  );
}
