import "server-only";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { capActions, capFlags, capPoints, employees } from "@/lib/db/schema";
import type { CapAction, CapFlag, CapPoint } from "@/lib/db/schema";
import { todayYMD } from "@/lib/credentials-constants";

export * from "@/lib/cap-constants";

function isLiveActive(p: CapPoint, today: string): boolean {
  if (p.status !== "active") return false;
  if (p.expiresAt && p.expiresAt < today) return false;
  return true;
}

export function balanceFromRows(rows: CapPoint[], today = todayYMD()): number {
  let sum = 0;
  for (const p of rows) if (isLiveActive(p, today)) sum += Number(p.points);
  return Math.max(0, sum);
}

export async function pointsForEmployee(employeeId: string): Promise<CapPoint[]> {
  return db.select().from(capPoints).where(eq(capPoints.employeeId, employeeId)).orderBy(desc(capPoints.createdAt));
}

export async function balanceForEmployee(employeeId: string): Promise<number> {
  return balanceFromRows(await pointsForEmployee(employeeId));
}

export async function getPoint(id: string): Promise<CapPoint | undefined> {
  return (await db.select().from(capPoints).where(eq(capPoints.id, id)))[0];
}
export async function getFlag(id: string): Promise<CapFlag | undefined> {
  return (await db.select().from(capFlags).where(eq(capFlags.id, id)))[0];
}

type Named<T> = { row: T; subjectName: string };

async function nameMap(ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!ids.length) return m;
  const rows = await db.select({ id: employees.id, name: employees.fullName }).from(employees).where(inArray(employees.id, ids));
  for (const r of rows) m.set(r.id, r.name);
  return m;
}

export async function listOpenFlags(): Promise<Named<CapFlag>[]> {
  const rows = await db.select().from(capFlags).where(eq(capFlags.status, "open")).orderBy(desc(capFlags.createdAt));
  const names = await nameMap(rows.map((r) => r.subjectEmployeeId));
  return rows.map((row) => ({ row, subjectName: names.get(row.subjectEmployeeId) ?? "—" }));
}

export async function listByStatus(status: string): Promise<Named<CapPoint>[]> {
  const rows = await db.select().from(capPoints).where(eq(capPoints.status, status)).orderBy(desc(capPoints.createdAt));
  const names = await nameMap(rows.map((r) => r.employeeId));
  return rows.map((row) => ({ row, subjectName: names.get(row.employeeId) ?? "—" }));
}

// ── Level corrective actions (phase 4) ──
export async function getCapAction(id: string): Promise<CapAction | undefined> {
  return (await db.select().from(capActions).where(eq(capActions.id, id)))[0];
}
export async function capActionsForEmployee(employeeId: string): Promise<CapAction[]> {
  return db.select().from(capActions).where(eq(capActions.employeeId, employeeId)).orderBy(desc(capActions.createdAt));
}
// All non-void corrective actions (for the console), with subject names.
export async function listCapActions(): Promise<{ row: CapAction; subjectName: string }[]> {
  const rows = await db.select().from(capActions).where(ne(capActions.status, "void")).orderBy(desc(capActions.createdAt));
  const names = await nameMap(rows.map((r) => r.employeeId));
  return rows.map((row) => ({ row, subjectName: names.get(row.employeeId) ?? "—" }));
}
// Set of `${employeeId}:${levelKey}` that already have an action (any status).
export async function existingActionKeys(): Promise<Set<string>> {
  const rows = await db.select({ e: capActions.employeeId, k: capActions.levelKey }).from(capActions);
  return new Set(rows.map((r) => `${r.e}:${r.k}`));
}

export async function activeEmployeeTiers(): Promise<{ id: string; tier: string | null }[]> {
  return db.select({ id: employees.id, tier: employees.tier }).from(employees).where(eq(employees.status, "active"));
}

// Active employees with their current CAP balance (for the roster overview).
export async function rosterBalances(): Promise<{ id: string; name: string; balance: number }[]> {
  const emps = await db
    .select({ id: employees.id, name: employees.fullName })
    .from(employees)
    .where(eq(employees.status, "active"));
  if (!emps.length) return [];
  const active = await db.select().from(capPoints).where(eq(capPoints.status, "active"));
  const today = todayYMD();
  const byEmp = new Map<string, CapPoint[]>();
  for (const p of active) {
    if (!byEmp.has(p.employeeId)) byEmp.set(p.employeeId, []);
    byEmp.get(p.employeeId)!.push(p);
  }
  return emps
    .map((e) => ({ id: e.id, name: e.name, balance: balanceFromRows(byEmp.get(e.id) ?? [], today) }))
    .sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
}
