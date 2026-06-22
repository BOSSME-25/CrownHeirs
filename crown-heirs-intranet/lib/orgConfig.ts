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
  accent?: string; // primary brand color (hex)
  accent2?: string; // secondary/accent color (hex)
  logoUrl?: string;
  faviconUrl?: string;
  loginImageUrl?: string; // login-screen background
  font?: string; // key into FONT_PRESETS
  notifyFrom?: string;
  pos?: {
    provider?: PosProvider;
    squareEnv?: "production" | "sandbox";
    squareLocationId?: string;
    squareTokenEnc?: string; // encrypted at rest
  };
};

// Curated font pairings each tenant can choose from. `href` loads the fonts;
// the three family values map to the theme's CSS variables.
export const FONT_PRESETS: Record<
  string,
  { label: string; href: string; serif: string; display: string; ui: string }
> = {
  crown: {
    label: "Crown Heirs (elegant serif)",
    href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400&family=Cinzel:wght@400;500&family=Jost:wght@300;400;500&display=swap",
    serif: "'Cormorant Garamond', serif",
    display: "'Cinzel', serif",
    ui: "'Jost', sans-serif",
  },
  editorial: {
    label: "Editorial (Playfair + Poppins)",
    href: "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&family=Poppins:wght@300;400;600&display=swap",
    serif: "'Playfair Display', serif",
    display: "'Playfair Display', serif",
    ui: "'Poppins', sans-serif",
  },
  modern: {
    label: "Modern (Fraunces + Inter)",
    href: "https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Inter:wght@300;400;600&display=swap",
    serif: "'Fraunces', serif",
    display: "'Fraunces', serif",
    ui: "'Inter', sans-serif",
  },
  clean: {
    label: "Clean (Montserrat + Lora)",
    href: "https://fonts.googleapis.com/css2?family=Lora:wght@400;600&family=Montserrat:wght@300;400;600&display=swap",
    serif: "'Lora', serif",
    display: "'Montserrat', sans-serif",
    ui: "'Montserrat', sans-serif",
  },
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
