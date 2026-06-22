import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import InventoryItemForm from "@/components/InventoryItemForm";
import { getAccess } from "@/lib/perms";
import { getItem, listVendors } from "@/lib/inventory";
import { listLocations } from "@/lib/org";
import { updateItem } from "@/app/inventory/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit Item — Inventory" };

export default async function EditItemPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canApprove) redirect("/inventory");

  const { id } = await params;
  const [item, vendors, locations] = await Promise.all([getItem(id), listVendors(), listLocations()]);
  if (!item) notFound();

  const update = updateItem.bind(null, id);

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Inventory</div>
          <h1 className="title">Edit {item.name}</h1>
        </div>
        <InventoryItemForm
          action={update}
          item={item}
          vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
          locations={locations.map((l) => ({ id: l.id, name: l.name }))}
        />
      </main>
    </>
  );
}
