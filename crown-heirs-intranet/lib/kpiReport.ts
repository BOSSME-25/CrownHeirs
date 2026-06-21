import "server-only";
import { listEmployees } from "@/lib/employees";
import { getKpis, getTeamKpis } from "@/lib/square";

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Builds the team-performance leaderboard as a CSV string.
// Shared by the admin download and the weekly email cron.
export async function buildTeamKpiCsv(): Promise<
  { ok: true; csv: string; filename: string } | { ok: false; reason: string }
> {
  const lines: string[] = [];

  // Salon-wide totals first (works even before any stylist is linked).
  const overall = await getKpis();
  if (overall.configured && "periods" in overall) {
    lines.push("Salon-wide totals");
    lines.push(["Period", "Sales", "Sales #", "Avg ticket", "Tips"].map(csvCell).join(","));
    for (const p of overall.periods) {
      lines.push(
        [p.label, p.sales.toFixed(2), p.count, p.avg.toFixed(2), p.tips.toFixed(2)]
          .map(csvCell)
          .join(","),
      );
    }
  }

  // Per-stylist section (only if employees are linked to Square).
  const linked = (await listEmployees())
    .filter((e) => e.squareTeamMemberId)
    .map((e) => ({ teamMemberId: e.squareTeamMemberId as string, name: e.fullName }));
  if (linked.length > 0) {
    const team = await getTeamKpis(linked);
    if (team.configured && "rows" in team) {
      if (lines.length) lines.push("");
      lines.push("Per-stylist");
      const header = ["Stylist"];
      for (const label of team.periodLabels) {
        header.push(`Tips (${label})`, `Clients (${label})`, `Retention (${label})`);
      }
      lines.push(header.map(csvCell).join(","));
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
    }
  }

  if (lines.length === 0) {
    return { ok: false, reason: "Square isn’t connected, so there’s no data to export yet." };
  }

  const today = new Date().toISOString().slice(0, 10);
  return { ok: true, csv: lines.join("\n"), filename: `crown-heirs-team-kpis-${today}.csv` };
}
