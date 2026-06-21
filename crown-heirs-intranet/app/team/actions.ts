"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";

const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

// Upload a profile photo if one was attached. Returns the URL, or
// undefined if no (valid) file was provided.
async function uploadPhoto(formData: FormData): Promise<string | undefined> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return undefined;
  if (file.size > 5 * 1024 * 1024) throw new Error("Photo must be under 5 MB.");
  const lower = file.name.toLowerCase();
  if (!IMAGE_EXT.some((ext) => lower.endsWith(ext))) {
    throw new Error("Photo must be an image (PNG, JPG, WEBP, or GIF).");
  }
  const blob = await put(`avatars/${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
  });
  return blob.url;
}

async function requireAdmin() {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    throw new Error("Only admins can manage the team.");
  }
}

// Pull values out of the submitted form, normalizing empties to null.
function readForm(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? null : s;
  };
  return {
    email: (get("email") ?? "").toLowerCase(),
    fullName: get("fullName") ?? "",
    phone: get("phone"),
    birthday: get("birthday"),
    jobTitle: get("jobTitle"),
    employmentType: get("employmentType"),
    status: get("status") ?? "active",
    role: get("role") ?? "staff",
    startDate: get("startDate"),
    wage: get("wage"),
    wageType: get("wageType"),
    emergencyContactName: get("emergencyContactName"),
    emergencyContactPhone: get("emergencyContactPhone"),
    notes: get("notes"),
    bio: get("bio"),
    whyCrownHeirs: get("whyCrownHeirs"),
    fiveYearPlan: get("fiveYearPlan"),
    favoriteAway: get("favoriteAway"),
  };
}

export async function createEmployee(formData: FormData) {
  await requireAdmin();
  const data = readForm(formData);
  if (!data.email || !data.fullName) {
    throw new Error("Name and email are required.");
  }
  const photoUrl = await uploadPhoto(formData);
  await db.insert(employees).values({ ...data, photoUrl: photoUrl ?? null });
  revalidatePath("/team");
  redirect("/team");
}

export async function updateEmployee(id: string, formData: FormData) {
  await requireAdmin();
  const data = readForm(formData);
  if (!data.email || !data.fullName) {
    throw new Error("Name and email are required.");
  }
  const photoUrl = await uploadPhoto(formData);
  await db
    .update(employees)
    .set({
      ...data,
      // Only replace the photo when a new one was uploaded.
      ...(photoUrl !== undefined ? { photoUrl } : {}),
      updatedAt: new Date(),
    })
    .where(eq(employees.id, id));
  revalidatePath("/team");
  redirect("/team");
}

export async function deleteEmployee(id: string) {
  await requireAdmin();
  await db.delete(employees).where(eq(employees.id, id));
  revalidatePath("/team");
}
