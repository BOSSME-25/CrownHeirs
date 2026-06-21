import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { listEmployees } from "@/lib/employees";
import { getTeamKpis } from "@/lib/square";

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Admin-only CSV download of the team performance leaderboard.
export async function GET() {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return new Response("Forbidden", { status: 403 });
  }

  const linked = (await listEmployees())
    .filter((e) => e.squareTeamMemberId)
    .map((e) => ({ teamMemberId: e.squareTeamMemberId as string, name: e.fullName }));

  if (linked.length === 0) {
    return new Response("No employees are linked to Square.", { status: 400 });
  }

  const team = await getTeamKpis(linked);
  if (!team.configured) return new Response("Square not configured.", { status: 400 });
  if ("error" in team) return new Response(`Square error: ${team.error}`, { status: 502 });

  const header = ["Stylist"];
  for (const label of team.periodLabels) {
    header.push(`Tips (${label})`, `Clients (${label})`, `Retention (${label})`);
  }

  const lines = [header.map(csvCell).join(",")];
  for (const row of team.rows) {
    const cells: (string | number)[] = [row.name];
    for (const p of row.periods) {
      cells.push(
        p.tips.toFixed(2),
        p.clients,
        p.retention === null ? "" : `${Math.round(p.retention * 100)}%`,
      );
    }
    lines.push(cells.map(csvCell).join(","));
  }

  const today = new Date().toISOString().slice(0, 10);
  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="crown-heirs-team-kpis-${today}.csv"`,
    },
  });
}
