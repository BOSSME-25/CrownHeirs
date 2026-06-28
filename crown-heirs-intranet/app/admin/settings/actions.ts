"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import { getDefaultOrg } from "@/lib/org";
import { FONT_PRESETS, saveOrgSettings, type PosProvider } from "@/lib/orgConfig";
import { canEncrypt, encryptSecret } from "@/lib/crypto";
import { putPrivate } from "@/lib/blobUpload";

async function requireSystem() {
  const session = await auth();
  if (!(await getAccess(session?.user?.email)).canSystem) {
    throw new Error("Only the CEO/COO can change settings.");
  }
}

export async function saveSettings(formData: FormData) {
  await requireSystem();
  const org = await getDefaultOrg();
  if (!org) throw new Error("Run database setup first.");

  const get = (k: string) => {
    const v = formData.get(k);
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? undefined : s;
  };

  const provider = (get("provider") as PosProvider) ?? "none";
  const pos: Record<string, unknown> = {
    provider,
    squareEnv: get("squareEnv") === "sandbox" ? "sandbox" : "production",
    squareLocationId: get("squareLocationId"),
  };

  // Only replace the token if a new one was entered (and we can encrypt it).
  const newToken = get("squareToken");
  if (newToken) {
    if (!canEncrypt()) {
      redirect(`/admin/settings?ok=${encodeURIComponent("Set APP_ENCRYPTION_KEY in Vercel before saving a token.")}`);
    }
    pos.squareTokenEnc = encryptSecret(newToken);
  }

  // Optional image uploads (logo, favicon, login background).
  async function upload(key: string, max: number): Promise<string | undefined> {
    const f = formData.get(key);
    if (!(f instanceof File) || f.size === 0) return undefined;
    if (f.size > max) throw new Error(`${key} is too large.`);
    return putPrivate("branding", f);
  }
  const logoUrl = await upload("logo", 4 * 1024 * 1024);
  const faviconUrl = await upload("favicon", 4 * 1024 * 1024);
  const loginImageUrl = await upload("loginImage", 4 * 1024 * 1024);

  const font = get("font");
  await saveOrgSettings(org.id, {
    businessName: get("businessName"),
    accent: get("accent"),
    accent2: get("accent2"),
    font: font && FONT_PRESETS[font] ? font : undefined,
    notifyFrom: get("notifyFrom"),
    ...(logoUrl ? { logoUrl } : {}),
    ...(faviconUrl ? { faviconUrl } : {}),
    ...(loginImageUrl ? { loginImageUrl } : {}),
    pos,
  });
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?ok=${encodeURIComponent("Settings saved")}`);
}
