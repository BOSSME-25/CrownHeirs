import "server-only";
import { and, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";
import type { AuditEntry } from "@/lib/db/schema";
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

// Build a human-readable "field: old → new" summary for changed keys, so the
// audit log captures the previous value (and is therefore recoverable).
// Only keys present in `after` are considered.
export function diffDetail(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
  keys: string[],
): string | null {
  const clip = (s: string) => (s.length > 300 ? s.slice(0, 300) + "…" : s);
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  const parts: string[] = [];
  for (const k of keys) {
    if (!(k in after)) continue;
    const b = str(before?.[k]);
    const a = str(after[k]);
    if (b !== a) parts.push(`${k}: "${clip(b)}" → "${clip(a)}"`);
  }
  return parts.length ? parts.join("; ") : null;
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

// Filtered audit query: by actor (substring), free text over action/entity/
// detail, and a date range. Used by the filterable audit view + CSV export.
export async function searchAudit(opts: {
  actor?: string | null;
  q?: string | null;
  since?: string | null;
  until?: string | null;
  limit?: number;
}): Promise<AuditEntry[]> {
  const org = await getDefaultOrg();
  const conds: (SQL | undefined)[] = [];
  if (org) conds.push(eq(auditLog.orgId, org.id));
  if (opts.actor) conds.push(ilike(auditLog.actorEmail, `%${opts.actor}%`));
  if (opts.q) {
    const like = `%${opts.q}%`;
    conds.push(or(ilike(auditLog.action, like), ilike(auditLog.entity, like), ilike(auditLog.detail, like)));
  }
  if (opts.since) conds.push(gte(auditLog.createdAt, new Date(opts.since + "T00:00:00")));
  if (opts.until) conds.push(lte(auditLog.createdAt, new Date(opts.until + "T23:59:59")));
  const where = conds.filter(Boolean) as SQL[];
  return db
    .select()
    .from(auditLog)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(opts.limit ?? 500);
}
