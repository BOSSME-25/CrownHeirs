import { and, asc, eq, gte, lte } from "drizzle-orm";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import { db } from "@/lib/db";
import { employees, timeEntries } from "@/lib/db/schema";
import { hoursOf, fmtAzTime, azDateOf } from "@/lib/timeclock";

function csvCell(v: string | number) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Manager/CEO-only payroll export: one row per punch, plus per-employee totals.
export async function GET(req: Request) {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canManageTeam) return new Response("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) return new Response("Missing from/to", { status: 400 });

  const start = new Date(`${from}T00:00:00-07:00`);
  const end = new Date(`${to}T23:59:59-07:00`);

  const rows = await db
    .select({ t: timeEntries, who: employees.fullName })
    .from(timeEntries)
    .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
    .where(and(gte(timeEntries.clockIn, start), lte(timeEntries.clockIn, end)))
    .orderBy(asc(employees.fullName), asc(timeEntries.clockIn));

  const lines = [["Staff", "Date", "Clock in", "Clock out", "Break (min)", "Hours"].map(csvCell).join(",")];
  const totals = new Map<string, number>();
  for (const { t, who } of rows) {
    const h = hoursOf(t);
    totals.set(who, (totals.get(who) ?? 0) + h);
    lines.push([
      who,
      azDateOf(t.clockIn),
      fmtAzTime(t.clockIn),
      t.clockOut ? fmtAzTime(t.clockOut) : "OPEN",
      t.breakMinutes,
      t.clockOut ? h.toFixed(2) : "",
    ].map(csvCell).join(","));
  }
  lines.push("");
  lines.push(["Totals", "", "", "", "", ""].map(csvCell).join(","));
  for (const [who, h] of [...totals.entries()].sort()) {
    lines.push([who, "", "", "", "", h.toFixed(2)].map(csvCell).join(","));
  }

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="crown-heirs-hours-${from}_to_${to}.csv"`,
    },
  });
}
