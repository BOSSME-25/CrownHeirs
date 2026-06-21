import "server-only";
import { listEmployees } from "@/lib/employees";
import { getTeamKpis } from "@/lib/square";

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Builds the team-performance leaderboard as a CSV string.
// Shared by the admin download and the weekly email cron.
export async function buildTeamKpiCsv(): Promise<
  { ok: true; csv: string; filename: string } | { ok: false; reason: string }
> {
  const linked = (await listEmployees())
    .filter((e) => e.squareTeamMemberId)
    .map((e) => ({ teamMemberId: e.squareTeamMemberId as string, name: e.fullName }));
  if (linked.length === 0) return { ok: false, reason: "No employees are linked to Square." };

  const team = await getTeamKpis(linked);
  if (!team.configured) return { ok: false, reason: "Square not configured." };
  if ("error" in team) return { ok: false, reason: `Square error: ${team.error}` };

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
  return { ok: true, csv: lines.join("\n"), filename: `crown-heirs-team-kpis-${today}.csv` };
}
