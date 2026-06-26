import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { credentials, employees } from "@/lib/db/schema";
import type { Credential } from "@/lib/db/schema";
import { getDefaultOrg } from "@/lib/org";
import { UNIVERSAL_TYPES } from "@/lib/credentials-constants";

export * from "@/lib/credentials-constants";

export type CredentialRow = { c: Credential; employeeName: string; employeeEmail: string };

// Make sure every active employee has the universal credential rows.
export async function ensureUniversalCredentials(): Promise<void> {
  const org = await getDefaultOrg();
  const active = await db
    .select({ id: employees.id, orgId: employees.orgId })
    .from(employees)
    .where(eq(employees.status, "active"));
  if (active.length === 0) return;
  const existing = await db
    .select({ employeeId: credentials.employeeId, type: credentials.type })
    .from(credentials)
    .where(inArray(credentials.employeeId, active.map((e) => e.id)));
  const have = new Set(existing.map((e) => `${e.employeeId}:${e.type}`));
  const rows: { orgId: string | null; employeeId: string; type: string }[] = [];
  for (const e of active) {
    for (const t of UNIVERSAL_TYPES) {
      if (!have.has(`${e.id}:${t}`)) rows.push({ orgId: e.orgId ?? org?.id ?? null, employeeId: e.id, type: t });
    }
  }
  if (rows.length) await db.insert(credentials).values(rows);
}

// All credentials with employee name/email (managers' view).
export async function listAllCredentials(): Promise<CredentialRow[]> {
  const emp = alias(employees, "emp");
  const rows = await db
    .select({ c: credentials, employeeName: emp.fullName, employeeEmail: emp.email, status: emp.status })
    .from(credentials)
    .innerJoin(emp, eq(credentials.employeeId, emp.id))
    .orderBy(asc(emp.fullName), asc(credentials.type));
  return rows
    .filter((r) => r.status === "active")
    .map((r) => ({ c: r.c, employeeName: r.employeeName, employeeEmail: r.employeeEmail }));
}

export async function listCredentialsFor(employeeId: string): Promise<Credential[]> {
  return db
    .select()
    .from(credentials)
    .where(eq(credentials.employeeId, employeeId))
    .orderBy(asc(credentials.type));
}

export async function getCredential(id: string): Promise<Credential | undefined> {
  const rows = await db.select().from(credentials).where(eq(credentials.id, id));
  return rows[0];
}

export async function getCredentialWithEmployee(id: string): Promise<CredentialRow | undefined> {
  const emp = alias(employees, "emp");
  const rows = await db
    .select({ c: credentials, employeeName: emp.fullName, employeeEmail: emp.email })
    .from(credentials)
    .innerJoin(emp, eq(credentials.employeeId, emp.id))
    .where(eq(credentials.id, id));
  return rows[0];
}
