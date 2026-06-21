import Link from "next/link";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import SiteHeader from "@/components/SiteHeader";
import Avatar from "@/components/Avatar";
import DeleteEmployeeButton from "@/components/DeleteEmployeeButton";
import { listEmployees, labelFor, EMPLOYMENT_TYPES, ROLES } from "@/lib/employees";
import { importFromSquare, importFromHomebaseCsv } from "@/app/team/actions";
import type { Employee } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team — Crown Heirs Team Hub" };

export default async function TeamPage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  const canManage = access.canManageTeam;
  const canSystem = access.canSystem;

  let employees: Employee[] = [];
  let setupNeeded = false;
  try {
    employees = await listEmployees();
  } catch {
    // Table doesn't exist yet / DB not provisioned.
    setupNeeded = true;
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div className="eyebrow">Team</div>
            <h1 className="title">The Crown Heirs Team</h1>
            <p className="lede">Everyone on the roster. {canManage && "As a manager/director, you can add and edit team members."}</p>
          </div>
          {canManage && !setupNeeded && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {canSystem && (
                <>
                  <form action={importFromSquare}>
                    <button className="btn btn-ghost" type="submit">⇪ Import from Square</button>
                  </form>
                  <form action={importFromHomebaseCsv} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="file" name="file" accept=".csv,text/csv" required
                      style={{ fontSize: "0.8rem", maxWidth: 170 }} />
                    <button className="btn btn-ghost" type="submit">Import Homebase CSV</button>
                  </form>
                </>
              )}
              <Link className="btn" href="/team/new">+ Add team member</Link>
            </div>
          )}
        </div>
        {canSystem && !setupNeeded && (
          <p className="muted" style={{ fontSize: "0.8rem", marginTop: -8, marginBottom: 18 }}>
            Imports fill name, phone, personal email, emergency contact, start date &amp; birthday where available.
            Add each person’s Crown Heirs login email afterward via <strong>Edit</strong>.
          </p>
        )}

        {setupNeeded ? (
          <div className="notice">
            The team database isn’t set up yet. {canSystem
              ? "Go to the Admin page and click “Set up database” to finish, then come back here."
              : "An admin needs to finish setup."}
          </div>
        ) : employees.length === 0 ? (
          <p className="muted">No team members yet. {canManage && "Click “Add team member” to start."}</p>
        ) : (
          <div className="grid">
            {employees.map((e) => (
              <div className="card" key={e.id} style={{ cursor: "default" }}>
                <Link href={`/team/${e.id}`} style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10, textDecoration: "none", color: "inherit" }}>
                  <Avatar name={e.fullName} src={e.photoUrl} size={52} />
                  <div>
                    <h3 style={{ marginBottom: 2 }}>{e.fullName}</h3>
                    <p style={{ color: "var(--terra)" }}>{e.jobTitle ?? "—"}</p>
                  </div>
                </Link>
                <p style={{ fontSize: "0.86rem" }}>
                  {e.email}
                  {e.phone ? <><br />{e.phone}</> : null}
                  <br />
                  <span className="muted">
                    {labelFor(EMPLOYMENT_TYPES, e.employmentType)} · {labelFor(ROLES, e.role)}
                    {e.status === "inactive" ? " · Inactive" : ""}
                  </span>
                </p>
                {canManage && (
                  <>
                    {e.wage != null && (
                      <p className="muted" style={{ marginTop: 8 }}>
                        Pay: ${e.wage} {e.wageType ? `(${e.wageType})` : ""}
                      </p>
                    )}
                    <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                      <Link className="btn btn-ghost" href={`/team/${e.id}/edit`}>Edit</Link>
                      <DeleteEmployeeButton id={e.id} name={e.fullName} />
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
