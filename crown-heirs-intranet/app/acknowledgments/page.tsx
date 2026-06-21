import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import SiteHeader from "@/components/SiteHeader";
import { db } from "@/lib/db";
import { employees, policies, policyAcks } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";
import { acknowledgePolicy, addPolicy, deactivatePolicy } from "@/app/acknowledgments/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Acknowledgments — Crown Heirs Team Hub" };

export default async function AcknowledgmentsPage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);

  let setupNeeded = false;
  let active: typeof policies.$inferSelect[] = [];
  let myAcks = new Set<string>();
  let me;
  const ackCount = new Map<string, number>();
  let staffTotal = 0;

  try {
    me = await getEmployeeByEmail(session?.user?.email ?? "");
    active = await db.select().from(policies).where(eq(policies.active, true));
    if (me) {
      const mine = await db.select().from(policyAcks).where(eq(policyAcks.employeeId, me.id));
      myAcks = new Set(mine.map((a) => a.policyId));
    }
    if (access.canViewHr && active.length) {
      const ids = active.map((p) => p.id);
      const allAcks = await db.select().from(policyAcks).where(inArray(policyAcks.policyId, ids));
      for (const a of allAcks) ackCount.set(a.policyId, (ackCount.get(a.policyId) ?? 0) + 1);
      const staff = await db.select({ id: employees.id }).from(employees).where(eq(employees.status, "active"));
      staffTotal = staff.length;
    }
  } catch {
    setupNeeded = true;
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Acknowledgments</div>
          <h1 className="title">Policies to Review</h1>
          <p className="lede">Read each policy and acknowledge it. Your acknowledgment is recorded with the date.</p>
        </div>

        {setupNeeded ? (
          <div className="notice">Run <strong>Admin → Set up / update database</strong> first.</div>
        ) : (
          <>
            {active.length === 0 ? (
              <p className="muted">No policies to acknowledge right now.</p>
            ) : (
              <div className="prose">
                {active.map((p) => {
                  const acked = myAcks.has(p.id);
                  return (
                    <div key={p.id} style={{ borderBottom: "1px solid var(--line,#eee)", padding: "14px 0" }}>
                      <h2 style={{ margin: "0 0 6px" }}>{p.title}</h2>
                      {p.body && <p style={{ whiteSpace: "pre-wrap", marginTop: 0 }}>{p.body}</p>}
                      {p.fileUrl && (
                        <p><a href={p.fileUrl} target="_blank" rel="noopener noreferrer">View document →</a></p>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
                        {acked ? (
                          <span className="badge" style={{ background: "#e7f4ea", color: "#1f5130" }}>✓ Acknowledged</span>
                        ) : (
                          <form action={acknowledgePolicy.bind(null, p.id)}>
                            <button className="btn" type="submit">I’ve read &amp; agree</button>
                          </form>
                        )}
                        {access.canViewHr && (
                          <span className="muted" style={{ fontSize: "0.82rem" }}>
                            {ackCount.get(p.id) ?? 0} of {staffTotal} staff acknowledged
                          </span>
                        )}
                        {access.canSystem && (
                          <form action={deactivatePolicy.bind(null, p.id)}>
                            <button className="btn btn-ghost" type="submit" style={{ fontSize: "0.8rem" }}>Archive</button>
                          </form>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {access.canSystem && (
              <form action={addPolicy} className="prose" style={{ marginTop: 28 }}>
                <h2>Add a policy</h2>
                <div className="field">
                  <label htmlFor="title">Title *</label>
                  <input id="title" name="title" required placeholder="e.g. Code of Conduct" />
                </div>
                <div className="field">
                  <label htmlFor="body">Text (optional)</label>
                  <textarea id="body" name="body" rows={4} />
                </div>
                <div className="field">
                  <label htmlFor="fileUrl">Document link (optional)</label>
                  <input id="fileUrl" name="fileUrl" placeholder="Link to a PDF in Documents" />
                </div>
                <button className="btn" type="submit">Add policy</button>
              </form>
            )}
          </>
        )}
      </main>
    </>
  );
}
