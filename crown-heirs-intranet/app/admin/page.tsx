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
        <InitDbButton />
        <AdminPanel />
      </main>
    </>
  );
}
