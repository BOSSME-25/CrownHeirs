import { and, asc, eq, inArray } from "drizzle-orm";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import SiteHeader from "@/components/SiteHeader";
import { db } from "@/lib/db";
import { employees, onboardingProgress, onboardingTasks } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";
import { addOnboardingTask, deleteOnboardingTask, toggleOnboardingTask } from "@/app/onboarding/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Onboarding — Crown Heirs Team Hub" };

export default async function OnboardingPage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);

  let setupNeeded = false;
  let tasks: typeof onboardingTasks.$inferSelect[] = [];
  let me;
  const myDone = new Set<string>();
  let roster: { name: string; done: number }[] = [];

  try {
    me = await getEmployeeByEmail(session?.user?.email ?? "");
    tasks = await db.select().from(onboardingTasks).where(eq(onboardingTasks.active, true)).orderBy(asc(onboardingTasks.createdAt));
    if (me) {
      const mine = await db.select().from(onboardingProgress).where(and(eq(onboardingProgress.employeeId, me.id), eq(onboardingProgress.done, true)));
      for (const p of mine) myDone.add(p.taskId);
    }
    if (access.canManageTeam && tasks.length) {
      const taskIds = tasks.map((t) => t.id);
      const staff = await db.select({ id: employees.id, name: employees.fullName }).from(employees).where(eq(employees.status, "active"));
      const allDone = await db.select().from(onboardingProgress).where(and(inArray(onboardingProgress.taskId, taskIds), eq(onboardingProgress.done, true)));
      const byEmp = new Map<string, number>();
      for (const p of allDone) byEmp.set(p.employeeId, (byEmp.get(p.employeeId) ?? 0) + 1);
      roster = staff
        .map((s) => ({ name: s.name, done: byEmp.get(s.id) ?? 0 }))
        .filter((r) => r.done < tasks.length) // still in progress
        .sort((a, b) => b.done - a.done);
    }
  } catch {
    setupNeeded = true;
  }

  const myCount = tasks.filter((t) => myDone.has(t.id)).length;

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Onboarding</div>
          <h1 className="title">Getting Started</h1>
          <p className="lede">Your onboarding checklist — work through it at your own pace.</p>
        </div>

        {setupNeeded ? (
          <div className="notice">Run <strong>Admin → Set up / update database</strong> first.</div>
        ) : tasks.length === 0 ? (
          <p className="muted">No onboarding tasks yet.{access.canSystem ? " Add some below." : ""}</p>
        ) : (
          <>
            {me && (
              <div className="prose">
                <p className="muted">{myCount} of {tasks.length} complete</p>
                {tasks.map((t) => {
                  const done = myDone.has(t.id);
                  return (
                    <form action={toggleOnboardingTask.bind(null, t.id)} key={t.id}
                      style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line,#f0e9e4)" }}>
                      <button type="submit" aria-label="Toggle" style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0, cursor: "pointer", marginTop: 2,
                        border: "1.5px solid var(--accent,#a0624a)", background: done ? "var(--accent,#a0624a)" : "#fff",
                        color: "#fff", lineHeight: 1,
                      }}>{done ? "✓" : ""}</button>
                      <span>
                        <strong style={{ textDecoration: done ? "line-through" : "none", opacity: done ? 0.6 : 1 }}>{t.title}</strong>
                        {t.description && <><br /><span className="muted" style={{ fontSize: "0.85rem" }}>{t.description}</span></>}
                      </span>
                    </form>
                  );
                })}
              </div>
            )}

            {access.canManageTeam && roster.length > 0 && (
              <div className="prose" style={{ marginTop: 28 }}>
                <h2>In progress</h2>
                {roster.map((r) => (
                  <p key={r.name} style={{ margin: "4px 0" }}>
                    {r.name} — <span className="muted">{r.done}/{tasks.length} done</span>
                  </p>
                ))}
              </div>
            )}
          </>
        )}

        {access.canSystem && (
          <div className="prose" style={{ marginTop: 28 }}>
            <h2>Manage checklist</h2>
            {tasks.map((t) => (
              <form action={deleteOnboardingTask.bind(null, t.id)} key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0" }}>
                <span>{t.title}</span>
                <button className="btn btn-ghost" type="submit" style={{ fontSize: "0.78rem" }}>Remove</button>
              </form>
            ))}
            <form action={addOnboardingTask} style={{ marginTop: 12 }}>
              <div className="field">
                <label htmlFor="title">New task *</label>
                <input id="title" name="title" required placeholder="e.g. Sign W-4 & I-9" />
              </div>
              <div className="field">
                <label htmlFor="description">Details (optional)</label>
                <input id="description" name="description" />
              </div>
              <button className="btn" type="submit">Add task</button>
            </form>
          </div>
        )}
      </main>
    </>
  );
}
