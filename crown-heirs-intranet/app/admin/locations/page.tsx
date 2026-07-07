import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import SiteHeader from "@/components/SiteHeader";
import { listLocations } from "@/lib/org";
import { addLocation, updateLocation } from "@/app/admin/locations/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Locations — Crown Heirs Team Hub" };

export default async function LocationsPage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canSystem) redirect("/");

  let locs: Awaited<ReturnType<typeof listLocations>> = [];
  let setupNeeded = false;
  try {
    locs = await listLocations();
  } catch {
    setupNeeded = true;
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Admin · Locations</div>
          <h1 className="title">Locations</h1>
          <p className="lede">Each physical salon. Staff, schedules, and KPIs can be scoped per location.</p>
        </div>

        {setupNeeded ? (
          <div className="notice">Run <strong>Admin → Set up / update database</strong> first.</div>
        ) : (
          <>
            <div className="grid" style={{ marginBottom: 28 }}>
              {locs.map((l) => (
                <details className="card" key={l.id} style={{ cursor: "default" }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                    {l.name}{l.active ? "" : " (inactive)"}
                  </summary>
                  <form action={updateLocation.bind(null, l.id)} className="prose" style={{ marginTop: 12 }}>
                    <div className="field">
                      <label>Name</label>
                      <input name="name" defaultValue={l.name} />
                    </div>
                    <div className="field">
                      <label>Square location ID</label>
                      <input name="squareLocationId" defaultValue={l.squareLocationId ?? ""} placeholder="From Square dashboard" />
                    </div>
                    <div className="field">
                      <label>Timezone</label>
                      <input name="timezone" defaultValue={l.timezone ?? "America/Phoenix"} />
                    </div>
                    <div className="field">
                      <label>Address</label>
                      <input name="address" defaultValue={l.address ?? ""} />
                    </div>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0" }}>
                      <input type="checkbox" name="active" defaultChecked={l.active} /> Active
                    </label>
                    <button className="btn" type="submit">Save</button>
                  </form>
                </details>
              ))}
            </div>

            <form action={addLocation} className="prose">
              <h2>Add a location</h2>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="name">Name *</label>
                  <input id="name" name="name" required placeholder="e.g. Scottsdale" />
                </div>
                <div className="field">
                  <label htmlFor="squareLocationId">Square location ID</label>
                  <input id="squareLocationId" name="squareLocationId" placeholder="Optional" />
                </div>
                <div className="field">
                  <label htmlFor="timezone">Timezone</label>
                  <input id="timezone" name="timezone" defaultValue="America/Phoenix" />
                </div>
                <div className="field">
                  <label htmlFor="address">Address</label>
                  <input id="address" name="address" />
                </div>
              </div>
              <button className="btn" type="submit">Add location</button>
            </form>
          </>
        )}
      </main>
    </>
  );
}
