import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, policies, policyAcks } from "@/lib/db/schema";
import type { Policy, PolicyAck } from "@/lib/db/schema";

export * from "@/lib/policies-constants";

export type PolicyWithAck = { policy: Policy; ack: PolicyAck | null };
export type AssignmentRow = { ack: PolicyAck; policy: Policy; employeeName: string; employeeEmail: string };

// Ensure every active employee has a current-version assignment row for every
// active policy. Rows left over from an older version are reset so the person
// is asked to re-sign.
export async function ensurePolicyAssignments(): Promise<void> {
  const active = await db.select({ id: employees.id }).from(employees).where(eq(employees.status, "active"));
  const pols = await db.select().from(policies).where(eq(policies.active, true));
  if (!active.length || !pols.length) return;

  const rows = await db
    .select()
    .from(policyAcks)
    .where(inArray(policyAcks.policyId, pols.map((p) => p.id)));
  const byKey = new Map(rows.map((r) => [`${r.policyId}:${r.employeeId}`, r]));

  const toInsert: { policyId: string; employeeId: string; version: number; acknowledgedAt: null }[] = [];
  for (const p of pols) {
    for (const e of active) {
      const r = byKey.get(`${p.id}:${e.id}`);
      if (!r) {
        toInsert.push({ policyId: p.id, employeeId: e.id, version: p.version, acknowledgedAt: null });
      } else if (r.version < p.version) {
        await db
          .update(policyAcks)
          .set({ version: p.version, acknowledgedAt: null, confirmedBy: null, confirmedAt: null, lastRemindedAt: null })
          .where(eq(policyAcks.id, r.id));
      }
    }
  }
  if (toInsert.length) await db.insert(policyAcks).values(toInsert).onConflictDoNothing();
}

// Active policies with the signed-in employee's own sign-off row.
export async function listMyPolicies(employeeId: string): Promise<PolicyWithAck[]> {
  const pols = await db
    .select()
    .from(policies)
    .where(eq(policies.active, true))
    .orderBy(asc(policies.category), asc(policies.title));
  if (!pols.length) return [];
  const rows = await db.select().from(policyAcks).where(eq(policyAcks.employeeId, employeeId));
  const byPolicy = new Map(rows.map((r) => [r.policyId, r]));
  return pols.map((p) => ({ policy: p, ack: byPolicy.get(p.id) ?? null }));
}

// Every active employee's assignment for every active policy (managers' view
// and the reminder cron). Assumes ensurePolicyAssignments() has run.
export async function listAssignments(): Promise<AssignmentRow[]> {
  const pols = await db.select().from(policies).where(eq(policies.active, true));
  if (!pols.length) return [];
  const polById = new Map(pols.map((p) => [p.id, p]));
  const rows = await db
    .select({
      ack: policyAcks,
      employeeName: employees.fullName,
      employeeEmail: employees.email,
      status: employees.status,
    })
    .from(policyAcks)
    .innerJoin(employees, eq(policyAcks.employeeId, employees.id))
    .where(inArray(policyAcks.policyId, pols.map((p) => p.id)));
  return rows
    .filter((r) => r.status === "active" && polById.has(r.ack.policyId))
    .map((r) => ({ ack: r.ack, policy: polById.get(r.ack.policyId)!, employeeName: r.employeeName, employeeEmail: r.employeeEmail }));
}

export async function listActivePolicies(): Promise<Policy[]> {
  return db.select().from(policies).where(eq(policies.active, true)).orderBy(asc(policies.category), asc(policies.title));
}

export async function getPolicy(id: string): Promise<Policy | undefined> {
  return (await db.select().from(policies).where(eq(policies.id, id)))[0];
}

export async function getMyAck(policyId: string, employeeId: string): Promise<PolicyAck | undefined> {
  return (
    await db.select().from(policyAcks).where(and(eq(policyAcks.policyId, policyId), eq(policyAcks.employeeId, employeeId)))
  )[0];
}
