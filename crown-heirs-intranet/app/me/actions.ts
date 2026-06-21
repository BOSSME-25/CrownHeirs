"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";

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
  const blob = await put(`avatars/${file.name}`, file, { access: "public", addRandomSuffix: true });
  return blob.url;
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

  await db
    .update(employees)
    .set({
      phone: get("phone"),
      birthday: get("birthday"),
      bio: get("bio"),
      whyCrownHeirs: get("whyCrownHeirs"),
      fiveYearPlan: get("fiveYearPlan"),
      favoriteAway: get("favoriteAway"),
      ...(photoUrl !== undefined ? { photoUrl } : {}),
      updatedAt: new Date(),
    })
    .where(eq(employees.id, me.id));

  revalidatePath("/team");
  revalidatePath(`/team/${me.id}`);
  revalidatePath("/me");
  redirect("/me?saved=1");
}
