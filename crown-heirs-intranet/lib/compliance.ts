import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { complianceEvidence, complianceItems } from "@/lib/db/schema";
import type { ComplianceEvidence, ComplianceItem } from "@/lib/db/schema";
import { getDefaultOrg } from "@/lib/org";

export * from "@/lib/compliance-constants";

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
