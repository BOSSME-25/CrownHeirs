import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentLinks } from "@/lib/db/schema";
import type { DocumentItem } from "@/lib/documents";
import { getDefaultOrg } from "@/lib/org";

// Externally-hosted documents (Drive/Dropbox/etc.), shaped like uploaded docs
// so the UI can list them together.
export async function listLinks(category?: string): Promise<DocumentItem[]> {
  const org = await getDefaultOrg();
  const conds = [];
  if (org) conds.push(eq(documentLinks.orgId, org.id));
  if (category) conds.push(eq(documentLinks.category, category));
  const rows = await db
    .select()
    .from(documentLinks)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(documentLinks.createdAt));
  return rows.map((l) => ({
    url: l.url,
    pathname: `link/${l.id}`,
    filename: l.title,
    category: l.category,
    size: 0,
    uploadedAt: (l.createdAt ?? new Date()).toISOString(),
    isLink: true,
    id: l.id,
  }));
}

export async function addLink(v: { category: string; title: string; url: string; createdBy?: string | null }) {
  const org = await getDefaultOrg();
  await db.insert(documentLinks).values({
    orgId: org?.id ?? null,
    category: v.category,
    title: v.title,
    url: v.url,
    createdBy: v.createdBy ?? null,
  });
}

export async function updateLink(id: string, v: { category: string; title: string; url: string }) {
  await db
    .update(documentLinks)
    .set({ category: v.category, title: v.title, url: v.url })
    .where(eq(documentLinks.id, id));
}

export async function deleteLink(id: string) {
  await db.delete(documentLinks).where(eq(documentLinks.id, id));
}
