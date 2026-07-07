import { redirect } from "next/navigation";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import InventoryItemForm from "@/components/InventoryItemForm";
import { getAccess } from "@/lib/perms";
import { listVendors } from "@/lib/inventory";
import { listLocations } from "@/lib/org";
import { createItem } from "@/app/inventory/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add Item — Inventory" };

export default async function NewItemPage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canApprove) redirect("/inventory");

  const [vendors, locations] = await Promise.all([listVendors(), listLocations()]);

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Inventory</div>
          <h1 className="title">Add an item</h1>
        </div>
        <InventoryItemForm
          action={createItem}
          vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
          locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        />
      </main>
    </>
  );
}
