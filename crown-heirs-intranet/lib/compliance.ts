import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { complianceAttestations, complianceEvidence, complianceItems } from "@/lib/db/schema";
import type { ComplianceAttestation, ComplianceEvidence, ComplianceItem } from "@/lib/db/schema";
import { getDefaultOrg } from "@/lib/org";

export * from "@/lib/compliance-constants";

// Shape of the register snapshot captured at attestation time.
export type AttestationSnapshot = {
  counts: { total: number; compliant: number; attention: number; overdue: number; due: number; na: number };
  items: { id: string; title: string; level: string; status: string; dueAt: string | null; key: string; label: string }[];
};

export async function listAttestations(limit = 50): Promise<ComplianceAttestation[]> {
  const org = await getDefaultOrg();
  const q = db.select().from(complianceAttestations).orderBy(desc(complianceAttestations.createdAt)).limit(limit);
  if (!org) return q;
  return db
    .select()
    .from(complianceAttestations)
    .where(eq(complianceAttestations.orgId, org.id))
    .orderBy(desc(complianceAttestations.createdAt))
    .limit(limit);
}

export async function getAttestation(id: string): Promise<ComplianceAttestation | undefined> {
  return (await db.select().from(complianceAttestations).where(eq(complianceAttestations.id, id)))[0];
}

export async function listComplianceItems(): Promise<ComplianceItem[]> {
  const org = await getDefaultOrg();
  const rows = org
    ? await db.select().from(complianceItems).where(eq(complianceItems.orgId, org.id))
    : await db.select().from(complianceItems);
  return rows.sort(
    (a, b) => a.level.localeCompare(b.level) || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
  );
}

export async function getComplianceItem(id: string): Promise<ComplianceItem | undefined> {
  return (await db.select().from(complianceItems).where(eq(complianceItems.id, id)))[0];
}

export async function evidenceFor(itemIds: string[]): Promise<Map<string, ComplianceEvidence[]>> {
  const byItem = new Map<string, ComplianceEvidence[]>();
  if (!itemIds.length) return byItem;
  const rows = await db
    .select()
    .from(complianceEvidence)
    .where(inArray(complianceEvidence.itemId, itemIds))
    .orderBy(asc(complianceEvidence.createdAt));
  for (const e of rows) {
    if (!byItem.has(e.itemId)) byItem.set(e.itemId, []);
    byItem.get(e.itemId)!.push(e);
  }
  return byItem;
}
