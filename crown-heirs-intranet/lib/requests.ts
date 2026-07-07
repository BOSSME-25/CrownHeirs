import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { employees, shifts, swapRequests, timeOffRequests } from "@/lib/db/schema";

export const TIME_OFF_TYPES = [
  { value: "vacation", label: "Vacation" },
  { value: "sick", label: "Sick" },
  { value: "personal", label: "Personal" },
  { value: "unpaid", label: "Unpaid" },
];

export function timeOffTypeLabel(value: string | null): string {
  if (!value) return "Time off";
  return TIME_OFF_TYPES.find((t) => t.value === value)?.label ?? value;
}

// ── Time off ──

export async function listMyTimeOff(employeeId: string) {
  return db
    .select()
    .from(timeOffRequests)
    .where(eq(timeOffRequests.employeeId, employeeId))
    .orderBy(desc(timeOffRequests.createdAt));
}

export async function listAllTimeOff() {
  return db
    .select({
      id: timeOffRequests.id,
      employeeName: employees.fullName,
      startDate: timeOffRequests.startDate,
      endDate: timeOffRequests.endDate,
      type: timeOffRequests.type,
      note: timeOffRequests.note,
      status: timeOffRequests.status,
      createdAt: timeOffRequests.createdAt,
    })
    .from(timeOffRequests)
    .innerJoin(employees, eq(timeOffRequests.employeeId, employees.id))
    .orderBy(asc(timeOffRequests.status), desc(timeOffRequests.startDate));
}

// ── Shift swaps ──

/** Which of the given shifts have a pending swap request. */
export async function pendingSwapShiftIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ shiftId: swapRequests.shiftId })
    .from(swapRequests)
    .where(and(inArray(swapRequests.shiftId, ids), eq(swapRequests.status, "pending")));
  return new Set(rows.map((r) => r.shiftId));
}

/** The pending swap request for a shift, with requester + target names. */
export async function pendingSwapForShift(shiftId: string) {
  const target = alias(employees, "target");
  const rows = await db
    .select({
      id: swapRequests.id,
      requesterName: employees.fullName,
      targetEmployeeId: swapRequests.targetEmployeeId,
      targetName: target.fullName,
      reason: swapRequests.reason,
      status: swapRequests.status,
    })
    .from(swapRequests)
    .innerJoin(employees, eq(swapRequests.requestedById, employees.id))
    .leftJoin(target, eq(swapRequests.targetEmployeeId, target.id))
    .where(and(eq(swapRequests.shiftId, shiftId), eq(swapRequests.status, "pending")));
  return rows[0];
}

export async function getSwap(id: string) {
  const rows = await db.select().from(swapRequests).where(eq(swapRequests.id, id));
  return rows[0];
}

export async function getShiftDate(shiftId: string): Promise<string | undefined> {
  const rows = await db
    .select({ d: shifts.shiftDate })
    .from(shifts)
    .where(eq(shifts.id, shiftId));
  return rows[0]?.d;
}
