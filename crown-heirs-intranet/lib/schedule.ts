import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, shifts } from "@/lib/db/schema";

// ── Date helpers (work in UTC on plain YYYY-MM-DD strings) ──

export function todayYMD(): string {
  return new Date().toISOString().slice(0, 10);
}

function ymdToDate(ymd: string): Date {
  return new Date(ymd + "T00:00:00Z");
}

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The Sunday that starts the week containing `ymd`. */
export function weekStart(ymd: string): string {
  const d = ymdToDate(ymd);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return toYMD(d);
}

export function addDays(ymd: string, n: number): string {
  const d = ymdToDate(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return toYMD(d);
}

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function dayLabel(ymd: string): { dow: string; short: string } {
  const d = ymdToDate(ymd);
  return { dow: DOW[d.getUTCDay()], short: `${MON[d.getUTCMonth()]} ${d.getUTCDate()}` };
}

export function rangeLabel(ws: string): string {
  const a = ymdToDate(ws);
  const b = ymdToDate(addDays(ws, 6));
  return `${MON[a.getUTCMonth()]} ${a.getUTCDate()} – ${MON[b.getUTCMonth()]} ${b.getUTCDate()}, ${b.getUTCFullYear()}`;
}

/** "09:00" → "9:00 AM" */
export function formatTime(hhmm: string): string {
  const [hStr, m] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

export type ShiftWithEmployee = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  position: string | null;
  notes: string | null;
  published: boolean;
};

/** All shifts for the week starting `ws`. Staff only see published ones. */
export async function shiftsForWeek(
  ws: string,
  includeUnpublished: boolean,
): Promise<ShiftWithEmployee[]> {
  const end = addDays(ws, 6);
  const conditions = [gte(shifts.shiftDate, ws), lte(shifts.shiftDate, end)];
  if (!includeUnpublished) conditions.push(eq(shifts.published, true));

  return db
    .select({
      id: shifts.id,
      employeeId: shifts.employeeId,
      employeeName: employees.fullName,
      employeeEmail: employees.email,
      shiftDate: shifts.shiftDate,
      startTime: shifts.startTime,
      endTime: shifts.endTime,
      position: shifts.position,
      notes: shifts.notes,
      published: shifts.published,
    })
    .from(shifts)
    .innerJoin(employees, eq(shifts.employeeId, employees.id))
    .where(and(...conditions))
    .orderBy(asc(shifts.shiftDate), asc(shifts.startTime));
}

export async function getShift(id: string) {
  const rows = await db.select().from(shifts).where(eq(shifts.id, id));
  return rows[0];
}

/** Active employees, for assigning shifts. */
export async function activeEmployees() {
  return db
    .select({ id: employees.id, fullName: employees.fullName })
    .from(employees)
    .where(eq(employees.status, "active"))
    .orderBy(asc(employees.fullName));
}
