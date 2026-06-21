import Link from "next/link";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import SiteHeader from "@/components/SiteHeader";
import Avatar from "@/components/Avatar";
import DeleteEmployeeButton from "@/components/DeleteEmployeeButton";
import { listEmployees, labelFor, EMPLOYMENT_TYPES, ROLES } from "@/lib/employees";
import type { Employee } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Team — Crown Heirs Team Hub" };

export default async function TeamPage() {
  const session = await auth();
  const admin = isAdmin(session?.user?.email);

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
            <p className="lede">Everyone on the roster. {admin && "As an admin, you can add and edit team members."}</p>
          </div>
          {admin && !setupNeeded && (
            <Link className="btn" href="/team/new">+ Add team member</Link>
          )}
        </div>

        {setupNeeded ? (
          <div className="notice">
            The team database isn’t set up yet. {admin
              ? "Go to the Admin page and click “Set up database” to finish, then come back here."
              : "An admin needs to finish setup."}
          </div>
        ) : employees.length === 0 ? (
          <p className="muted">No team members yet. {admin && "Click “Add team member” to start."}</p>
        ) : (
          <div className="grid">
            {employees.map((e) => (
              <div className="card" key={e.id} style={{ cursor: "default" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
                  <Avatar name={e.fullName} src={e.photoUrl} size={52} />
                  <div>
                    <h3 style={{ marginBottom: 2 }}>{e.fullName}</h3>
                    <p style={{ color: "var(--terra)" }}>{e.jobTitle ?? "—"}</p>
                  </div>
                </div>
                <p style={{ fontSize: "0.86rem" }}>
                  {e.email}
                  {e.phone ? <><br />{e.phone}</> : null}
                  <br />
                  <span className="muted">
                    {labelFor(EMPLOYMENT_TYPES, e.employmentType)} · {labelFor(ROLES, e.role)}
                    {e.status === "inactive" ? " · Inactive" : ""}
                  </span>
                </p>
                {admin && (
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
