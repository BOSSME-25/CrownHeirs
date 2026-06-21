import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import { getDefaultOrg } from "@/lib/org";

// Record a change for the audit trail. Never throws — auditing must not
// break the underlying action.
export async function logAudit(entry: {
  actorEmail?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  detail?: string | null;
}) {
  try {
    const org = await getDefaultOrg();
    await db.insert(auditLog).values({
      orgId: org?.id ?? null,
      actorEmail: entry.actorEmail ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      detail: entry.detail ?? null,
    });
  } catch {
    // swallow — auditing is best-effort
  }
}

export async function recentAudit(limit = 200) {
  const org = await getDefaultOrg();
  const base = db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
  if (!org) return base;
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.orgId, org.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
