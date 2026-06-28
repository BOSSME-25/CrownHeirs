"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";
import { putPrivate } from "@/lib/blobUpload";
import { logAudit, diffDetail } from "@/lib/audit";

// Create the private calendar-subscription token if the user doesn't have one.
export async function ensureCalendarToken() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Not signed in.");
  const me = await getEmployeeByEmail(email);
  if (!me) throw new Error("You’re not on the team roster yet.");
  if (!me.calendarToken) {
    const token = randomBytes(24).toString("hex");
    await db.update(employees).set({ calendarToken: token }).where(eq(employees.id, me.id));
  }
  revalidatePath("/me");
}

const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

async function uploadPhoto(formData: FormData): Promise<string | undefined> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return undefined;
  if (file.size > 5 * 1024 * 1024) throw new Error("Photo must be under 5 MB.");
  const lower = file.name.toLowerCase();
  if (!IMAGE_EXT.some((ext) => lower.endsWith(ext))) {
    throw new Error("Photo must be an image (PNG, JPG, WEBP, or GIF).");
  }
  return putPrivate("avatars", file);
}

// A staffer edits their own profile (contact + "about" fields only —
// not role, pay, or status, which stay admin-managed).
export async function updateMyProfile(formData: FormData) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Not signed in.");
  const me = await getEmployeeByEmail(email);
  if (!me) throw new Error("You’re not on the team roster yet. Ask an admin to add you.");

  const get = (k: string) => {
    const v = formData.get(k);
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? null : s;
  };
  const photoUrl = await uploadPhoto(formData);

  // Only touch a field when its input was actually present in the submission.
  // This makes it impossible for a stale or partial form to blank out a
  // staffer's saved answers — a missing field is left untouched, while a
  // present-but-empty field still clears (an intentional edit).
  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["phone", "birthday", "bio", "whyCrownHeirs", "fiveYearPlan", "favoriteAway"]) {
    if (formData.has(k)) set[k] = get(k);
  }
  if (photoUrl !== undefined) set.photoUrl = photoUrl;

  await db.update(employees).set(set).where(eq(employees.id, me.id));

  // Record old→new so a staffer's edits (and prior answers) are recoverable.
  const detail = diffDetail(me as unknown as Record<string, unknown>, set, [
    "phone", "birthday", "bio", "whyCrownHeirs", "fiveYearPlan", "favoriteAway",
  ]);
  if (detail) {
    await logAudit({ actorEmail: email, action: "update", entity: "employee", entityId: me.id, detail: `Self-edit — ${detail}` });
  }

  revalidatePath("/team");
  revalidatePath(`/team/${me.id}`);
  revalidatePath("/me");
  redirect(`/me?ok=${encodeURIComponent("Profile saved")}`);
}
