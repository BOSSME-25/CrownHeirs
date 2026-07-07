import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import { getAccess } from "@/lib/perms";
import { listVendors, getVendor } from "@/lib/inventory";
import { createVendor, updateVendor, setVendorActive } from "@/app/inventory/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vendors — Inventory" };

export default async function VendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canApprove) redirect("/inventory");

  const { edit } = await searchParams;
  const vendors = await listVendors(true);
  const editing = edit ? await getVendor(edit) : undefined;
  const action = editing ? updateVendor.bind(null, editing.id) : createVendor;

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow"><Link href="/inventory">Inventory</Link> · Vendors</div>
          <h1 className="title">Vendors &amp; suppliers</h1>
          <p className="lede">Who you order from — contact info and account numbers for reordering.</p>
        </div>

        <form className="prose" action={action} style={{ marginBottom: 24 }}>
          <h2>{editing ? `Edit ${editing.name}` : "Add a vendor"}</h2>
          <div className="form-grid">
            <div className="field"><label htmlFor="name">Vendor name *</label>
              <input id="name" name="name" defaultValue={editing?.name ?? ""} required /></div>
            <div className="field"><label htmlFor="contactName">Contact name</label>
              <input id="contactName" name="contactName" defaultValue={editing?.contactName ?? ""} /></div>
            <div className="field"><label htmlFor="phone">Phone</label>
              <input id="phone" name="phone" defaultValue={editing?.phone ?? ""} /></div>
            <div className="field"><label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" defaultValue={editing?.email ?? ""} spellCheck={false} /></div>
            <div className="field"><label htmlFor="website">Website</label>
              <input id="website" name="website" defaultValue={editing?.website ?? ""} placeholder="https://" /></div>
            <div className="field"><label htmlFor="accountNumber">Account number</label>
              <input id="accountNumber" name="accountNumber" defaultValue={editing?.accountNumber ?? ""} /></div>
          </div>
          <div className="field"><label htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" rows={2} defaultValue={editing?.notes ?? ""} /></div>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn" type="submit">{editing ? "Save vendor" : "Add vendor"}</button>
            {editing && <Link className="btn btn-ghost" href="/inventory/vendors">Cancel</Link>}
          </div>
        </form>

        {vendors.length === 0 ? (
          <div className="notice">No vendors yet.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>Vendor</th><th>Contact</th><th>Account</th><th></th></tr>
            </thead>
            <tbody>
              {vendors.map((v) => {
                const toggle = setVendorActive.bind(null, v.id, !v.active);
                return (
                  <tr key={v.id} style={{ opacity: v.active ? 1 : 0.55 }}>
                    <td>
                      <strong>{v.name}</strong>{!v.active && <span className="muted"> (archived)</span>}
                      {v.website && <div className="muted">{v.website}</div>}
                    </td>
                    <td>
                      {v.contactName && <div>{v.contactName}</div>}
                      {v.phone && <div className="muted">{v.phone}</div>}
                      {v.email && <div className="muted">{v.email}</div>}
                    </td>
                    <td>{v.accountNumber ?? "—"}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <Link href={`/inventory/vendors?edit=${v.id}`} className="tag">Edit</Link>{" "}
                      <form action={toggle} style={{ display: "inline" }}>
                        <button type="submit" className="tag" style={{ cursor: "pointer", background: "none" }}>
                          {v.active ? "Archive" : "Restore"}
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}
