import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import SiteHeader from "@/components/SiteHeader";
import { db } from "@/lib/db";
import { employees, reviews } from "@/lib/db/schema";
import { getEmployeeByEmail, listEmployees } from "@/lib/employees";
import { createReview, deleteReview, shareReview } from "@/app/reviews/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reviews — Crown Heirs Team Hub" };

function Stars({ n }: { n: number | null }) {
  if (!n) return null;
  return <span style={{ color: "#c79a3a" }}>{"★".repeat(n)}{"☆".repeat(Math.max(0, 5 - n))}</span>;
}

export default async function ReviewsPage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);

  let setupNeeded = false;
  let me;
  let roster: { id: string; fullName: string }[] = [];
  let rows: (typeof reviews.$inferSelect & { who?: string })[] = [];

  try {
    me = await getEmployeeByEmail(session?.user?.email ?? "");
    if (access.canApprove) {
      roster = (await listEmployees()).map((e) => ({ id: e.id, fullName: e.fullName }));
      const all = await db
        .select({ r: reviews, who: employees.fullName })
        .from(reviews)
        .innerJoin(employees, eq(reviews.employeeId, employees.id))
        .orderBy(desc(reviews.createdAt));
      rows = all.map((x) => ({ ...x.r, who: x.who }));
    } else if (me) {
      const mine = await db
        .select()
        .from(reviews)
        .where(eq(reviews.employeeId, me.id))
        .orderBy(desc(reviews.createdAt));
      rows = mine.filter((r) => r.status === "shared");
    }
  } catch {
    setupNeeded = true;
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Reviews</div>
          <h1 className="title">Performance Reviews</h1>
          <p className="lede">
            {access.canApprove ? "Write and share reviews with your team." : "Your shared performance reviews."}
          </p>
        </div>

        {setupNeeded ? (
          <div className="notice">Run <strong>Admin → Set up / update database</strong> first.</div>
        ) : (
          <>
            {rows.length === 0 ? (
              <p className="muted">{access.canApprove ? "No reviews yet." : "No reviews have been shared with you yet."}</p>
            ) : (
              <div className="prose">
                {rows.map((r) => (
                  <div key={r.id} style={{ border: "1px solid var(--line,#ece3dd)", borderRadius: 12, padding: 16, marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <strong>
                        {access.canApprove ? r.who : r.periodLabel || "Review"}
                        {access.canApprove && r.periodLabel ? ` — ${r.periodLabel}` : ""}
                      </strong>
                      <span className="muted" style={{ fontSize: "0.82rem" }}>
                        {r.reviewDate ?? ""} {r.status === "draft" ? "· Draft" : ""}
                      </span>
                    </div>
                    {r.rating ? <p style={{ margin: "6px 0" }}><Stars n={r.rating} /></p> : null}
                    {r.strengths && <p style={{ margin: "6px 0" }}><strong>Strengths:</strong> {r.strengths}</p>}
                    {r.growth && <p style={{ margin: "6px 0" }}><strong>Growth areas:</strong> {r.growth}</p>}
                    {r.goals && <p style={{ margin: "6px 0" }}><strong>Goals:</strong> {r.goals}</p>}
                    {access.canApprove && (
                      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                        {r.status === "draft" && (
                          <form action={shareReview.bind(null, r.id)}>
                            <button className="btn" type="submit" style={{ fontSize: "0.8rem" }}>Share with employee</button>
                          </form>
                        )}
                        <form action={deleteReview.bind(null, r.id)}>
                          <button className="btn btn-ghost" type="submit" style={{ fontSize: "0.8rem" }}>Delete</button>
                        </form>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {access.canApprove && (
              <form action={createReview} className="prose" style={{ marginTop: 24 }}>
                <h2>New review</h2>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="employeeId">Team member *</label>
                    <select id="employeeId" name="employeeId" required defaultValue="">
                      <option value="" disabled>Choose…</option>
                      {roster.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="periodLabel">Period</label>
                    <input id="periodLabel" name="periodLabel" placeholder="e.g. Q2 2026 / 90-day" />
                  </div>
                  <div className="field">
                    <label htmlFor="reviewDate">Date</label>
                    <input id="reviewDate" name="reviewDate" type="date" />
                  </div>
                  <div className="field">
                    <label htmlFor="rating">Overall rating (1–5)</label>
                    <select id="rating" name="rating" defaultValue="">
                      <option value="">—</option>
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="strengths">Strengths</label>
                  <textarea id="strengths" name="strengths" rows={2} />
                </div>
                <div className="field">
                  <label htmlFor="growth">Growth areas</label>
                  <textarea id="growth" name="growth" rows={2} />
                </div>
                <div className="field">
                  <label htmlFor="goals">Goals</label>
                  <textarea id="goals" name="goals" rows={2} />
                </div>
                <label style={{ display: "flex", gap: 8, alignItems: "center", margin: "8px 0" }}>
                  <input type="checkbox" name="share" /> Share with employee now (otherwise saved as draft)
                </label>
                <button className="btn" type="submit">Save review</button>
              </form>
            )}
          </>
        )}
      </main>
    </>
  );
}
