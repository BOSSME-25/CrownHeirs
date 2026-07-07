import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { buildTeamKpiCsv } from "@/lib/kpiReport";

// Admin-only CSV download of the team performance leaderboard.
export async function GET() {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return new Response("Forbidden", { status: 403 });
  }

  const report = await buildTeamKpiCsv();
  if (!report.ok) return new Response(report.reason, { status: 400 });

  return new Response(report.csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${report.filename}"`,
    },
  });
}
