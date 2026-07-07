import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import SiteHeader from "@/components/SiteHeader";
import { requiredDashboard, type DashVideo } from "@/lib/training";

export const dynamic = "force-dynamic";
export const metadata = { title: "Training completion — Crown Heirs Team Hub" };

function fmtDate(ymd: string) {
  return new Date(ymd + "T00:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC", month: "short", day: "numeric", year: "numeric",
  });
}

export default async function TrainingDashboardPage() {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) redirect("/training");

  let rows: DashVideo[] = [];
  let setupNeeded = false;
  try {
    rows = await requiredDashboard();
  } catch {
    setupNeeded = true;
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">
            <Link href="/training" style={{ color: "var(--terra)", textDecoration: "none" }}>← Back to training</Link>
          </div>
          <h1 className="title">Training Completion</h1>
          <p className="lede">Who still owes which required trainings.</p>
        </div>

        {setupNeeded ? (
          <div className="notice">Run Admin → “Set up / update database”, then come back.</div>
        ) : rows.length === 0 ? (
          <p className="muted">No required trainings yet. Mark a video “Required” to track completion.</p>
        ) : (
          rows.map(({ video, rows: people, completeCount, total, overdue }) => {
            const incomplete = people.filter((p) => !p.complete);
            return (
              <div className="prose" key={video.id} style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                  <h2 style={{ margin: 0 }}>
                    <Link href={`/training/${video.id}`} style={{ textDecoration: "none", color: "var(--ink)" }}>{video.title}</Link>
                  </h2>
                  <span className={`status-badge ${completeCount === total ? "approved" : overdue ? "denied" : "pending"}`}>
                    {completeCount}/{total} complete{video.dueDate ? ` · due ${fmtDate(video.dueDate)}` : ""}{overdue ? " · overdue" : ""}
                  </span>
                </div>
                {incomplete.length === 0 ? (
                  <p className="muted" style={{ marginTop: 10 }}>Everyone’s done. 🎉</p>
                ) : (
                  <p style={{ marginTop: 10 }}>
                    <strong>Still owes:</strong> {incomplete.map((p) => p.name).join(", ")}
                  </p>
                )}
              </div>
            );
          })
        )}
      </main>
    </>
  );
}
