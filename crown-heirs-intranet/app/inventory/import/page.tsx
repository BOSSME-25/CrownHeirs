import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import InventoryImport from "@/components/InventoryImport";
import { getAccess } from "@/lib/perms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import CSV — Inventory" };

export default async function ImportPage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canApprove) redirect("/inventory");

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow"><Link href="/inventory">Inventory</Link> · Import</div>
          <h1 className="title">Import from a spreadsheet</h1>
          <p className="lede">
            Upload a CSV of your current stock — we’ll match your columns, let you
            preview, then create items (and vendors) and set starting counts.
          </p>
        </div>
        <InventoryImport />
      </main>
    </>
  );
}
