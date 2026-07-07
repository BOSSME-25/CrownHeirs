import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { ptoLedger } from "@/lib/db/schema";

// Estimated paid hours per day off, used when an approved request is
// auto-deducted. Managers can correct the entry afterward.
export const DEFAULT_HOURS_PER_DAY = 8;

export function daysInclusive(start: string, end: string): number {
  const a = new Date(start + "T00:00:00Z").getTime();
  const b = new Date(end + "T00:00:00Z").getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

export async function balanceFor(employeeId: string): Promise<number> {
  const rows = await db.select({ h: ptoLedger.hours }).from(ptoLedger).where(eq(ptoLedger.employeeId, employeeId));
  return Math.round(rows.reduce((s, r) => s + Number(r.h), 0) * 100) / 100;
}

export async function ledgerFor(employeeId: string) {
  return db.select().from(ptoLedger).where(eq(ptoLedger.employeeId, employeeId)).orderBy(desc(ptoLedger.createdAt));
}
