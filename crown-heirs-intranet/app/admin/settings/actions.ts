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
  const MAX_BYTES = 4 * 1024 * 1024;
  const MAX_LABEL = "4 MB";
  async function upload(key: string, label: string): Promise<string | undefined> {
    const f = formData.get(key);
    if (!(f instanceof File) || f.size === 0) return undefined;
    if (f.size > MAX_BYTES) {
      const mb = (f.size / (1024 * 1024)).toFixed(1);
      redirect(
        `/admin/settings?err=${encodeURIComponent(`${label} is too big (${mb} MB). The maximum is ${MAX_LABEL} — please choose a smaller image.`)}`,
      );
    }
    return putPrivate("branding", f);
  }
  const logoUrl = await upload("logo", "Logo");
  const faviconUrl = await upload("favicon", "Favicon");
  const loginImageUrl = await upload("loginImage", "Login background");

  // Per image: a new upload replaces it; otherwise a "remove" checkbox clears
  // it back to the default (empty string = falls back to wordmark/monogram).
  const imagePatch: Record<string, string> = {};
  if (logoUrl) imagePatch.logoUrl = logoUrl;
  else if (get("removeLogo")) imagePatch.logoUrl = "";
  if (faviconUrl) imagePatch.faviconUrl = faviconUrl;
  else if (get("removeFavicon")) imagePatch.faviconUrl = "";
  if (loginImageUrl) imagePatch.loginImageUrl = loginImageUrl;
  else if (get("removeLoginImage")) imagePatch.loginImageUrl = "";

  const font = get("font");
  await saveOrgSettings(org.id, {
    businessName: get("businessName"),
    accent: get("accent"),
    accent2: get("accent2"),
    font: font && FONT_PRESETS[font] ? font : undefined,
    notifyFrom: get("notifyFrom"),
    ...imagePatch,
    pos,
  });
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?ok=${encodeURIComponent("Settings saved")}`);
}
