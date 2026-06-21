import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { getDefaultOrg } from "@/lib/org";
import { decryptSecret } from "@/lib/crypto";

// Supported POS / payments providers. Square is the first real adapter;
// "manual" means sales are entered/imported by CSV; "none" disables KPIs.
export type PosProvider = "square" | "manual" | "none";

export type OrgSettings = {
  businessName?: string;
  accent?: string; // brand color
  notifyFrom?: string;
  pos?: {
    provider?: PosProvider;
    squareEnv?: "production" | "sandbox";
    squareLocationId?: string;
    squareTokenEnc?: string; // encrypted at rest
  };
};

export async function getOrgSettings(orgId?: string): Promise<{ orgId: string | null; settings: OrgSettings }> {
  let org;
  if (orgId) {
    org = (await db.select().from(organizations).where(eq(organizations.id, orgId)))[0];
  } else {
    org = await getDefaultOrg();
  }
  return { orgId: org?.id ?? null, settings: (org?.settings as OrgSettings) ?? {} };
}

export async function saveOrgSettings(orgId: string, patch: Partial<OrgSettings>) {
  const current = (await db.select().from(organizations).where(eq(organizations.id, orgId)))[0];
  const merged: OrgSettings = { ...(current?.settings as OrgSettings), ...patch };
  if (patch.pos) merged.pos = { ...(current?.settings as OrgSettings)?.pos, ...patch.pos };
  await db.update(organizations).set({ settings: merged }).where(eq(organizations.id, orgId));
}

// Which POS a tenant uses. DB setting wins; otherwise infer from env (so the
// existing Crown Heirs env setup keeps working) or "none".
export async function posProvider(orgId?: string): Promise<PosProvider> {
  const { settings } = await getOrgSettings(orgId);
  if (settings.pos?.provider) return settings.pos.provider;
  return process.env.SQUARE_ACCESS_TOKEN ? "square" : "none";
}

export type SquareCreds = { token: string; locationId?: string; env: "production" | "sandbox" };

// Resolves Square credentials from the org's encrypted settings, falling back
// to environment variables for the default (Crown Heirs) org.
export async function getSquareCreds(orgId?: string): Promise<SquareCreds | null> {
  const { settings } = await getOrgSettings(orgId);
  const dbToken = decryptSecret(settings.pos?.squareTokenEnc);
  const token = dbToken || process.env.SQUARE_ACCESS_TOKEN || "";
  if (!token) return null;
  return {
    token,
    locationId: settings.pos?.squareLocationId || process.env.SQUARE_LOCATION_ID || undefined,
    env: settings.pos?.squareEnv || (process.env.SQUARE_ENV === "sandbox" ? "sandbox" : "production"),
  };
}
