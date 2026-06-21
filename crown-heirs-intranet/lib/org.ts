import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations, locations } from "@/lib/db/schema";
import type { Location } from "@/lib/db/schema";

// The tenant. Until the SaaS layer (Phase 3) there's a single org (Crown Heirs).
export async function getDefaultOrg() {
  const rows = await db
    .select()
    .from(organizations)
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  return rows[0];
}

export async function listLocations(orgId?: string): Promise<Location[]> {
  let id = orgId;
  if (!id) {
    const org = await getDefaultOrg();
    if (!org) return [];
    id = org.id;
  }
  return db.select().from(locations).where(eq(locations.orgId, id)).orderBy(asc(locations.name));
}
