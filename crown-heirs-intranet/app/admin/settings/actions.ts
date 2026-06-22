"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { put } from "@vercel/blob";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import { getDefaultOrg } from "@/lib/org";
import { FONT_PRESETS, saveOrgSettings, type PosProvider } from "@/lib/orgConfig";
import { canEncrypt, encryptSecret } from "@/lib/crypto";

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

  // Optional logo upload.
  let logoUrl: string | undefined;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > 2 * 1024 * 1024) throw new Error("Logo must be under 2 MB.");
    const blob = await put(`branding/${logo.name}`, logo, { access: "public", addRandomSuffix: true });
    logoUrl = blob.url;
  }

  const font = get("font");
  await saveOrgSettings(org.id, {
    businessName: get("businessName"),
    accent: get("accent"),
    font: font && FONT_PRESETS[font] ? font : undefined,
    notifyFrom: get("notifyFrom"),
    ...(logoUrl ? { logoUrl } : {}),
    pos,
  });
  revalidatePath("/admin/settings");
  redirect(`/admin/settings?ok=${encodeURIComponent("Settings saved")}`);
}
