import Link from "next/link";
import { ITEM_CATEGORIES } from "@/lib/inventory";
import type { InventoryItem, Vendor } from "@/lib/db/schema";

export default function InventoryItemForm({
  action,
  item,
  vendors,
  locations,
}: {
  action: (formData: FormData) => void;
  item?: InventoryItem;
  vendors: { id: string; name: string }[];
  locations?: { id: string; name: string }[];
}) {
  const i = item;
  return (
    <form className="prose" action={action}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="name">Item name *</label>
          <input id="name" name="name" defaultValue={i?.name ?? ""} required placeholder="e.g. Olaplex No. 3" />
        </div>
        <div className="field">
          <label htmlFor="brand">Brand</label>
          <input id="brand" name="brand" defaultValue={i?.brand ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="category">Category</label>
          <select id="category" name="category" defaultValue={i?.category ?? "retail"}>
            {ITEM_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="vendorId">Vendor</label>
          <select id="vendorId" name="vendorId" defaultValue={i?.vendorId ?? ""}>
            <option value="">—</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sku">SKU / code</label>
          <input id="sku" name="sku" defaultValue={i?.sku ?? ""} />
        </div>
        <div className="field">
          <label htmlFor="size">Size</label>
          <input id="size" name="size" defaultValue={i?.size ?? ""} placeholder="e.g. 8 oz, 100 ml" />
        </div>
        <div className="field">
          <label htmlFor="unit">Unit</label>
          <input id="unit" name="unit" defaultValue={i?.unit ?? ""} placeholder="bottle, each, tube" />
        </div>
        <div className="field">
          <label htmlFor="cost">Cost (your price)</label>
          <input id="cost" name="cost" type="number" step="0.01" defaultValue={i?.cost ?? ""} placeholder="0.00" />
        </div>
        <div className="field">
          <label htmlFor="retailPrice">Retail price</label>
          <input id="retailPrice" name="retailPrice" type="number" step="0.01" defaultValue={i?.retailPrice ?? ""} placeholder="0.00" />
        </div>
        <div className="field">
          <label htmlFor="reorderPoint">Reorder point</label>
          <input id="reorderPoint" name="reorderPoint" type="number" step="1" defaultValue={i?.reorderPoint ?? "0"} />
        </div>
        {!i && (
          <div className="field">
            <label htmlFor="initialQty">Starting quantity on hand</label>
            <input id="initialQty" name="initialQty" type="number" step="1" defaultValue="0" />
          </div>
        )}
        {locations && locations.length > 0 && (
          <div className="field">
            <label htmlFor="locationId">Location</label>
            <select id="locationId" name="locationId" defaultValue={i?.locationId ?? ""}>
              <option value="">—</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="field">
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={2} defaultValue={i?.notes ?? ""} />
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        <button className="btn" type="submit">{i ? "Save changes" : "Add item"}</button>
        <Link className="btn btn-ghost" href={i ? `/inventory/${i.id}` : "/inventory"}>Cancel</Link>
      </div>
    </form>
  );
}
