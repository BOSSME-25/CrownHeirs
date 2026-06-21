"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";

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
  };
}

export async function createEmployee(formData: FormData) {
  await requireAdmin();
  const data = readForm(formData);
  if (!data.email || !data.fullName) {
    throw new Error("Name and email are required.");
  }
  await db.insert(employees).values(data);
  revalidatePath("/team");
  redirect("/team");
}

export async function updateEmployee(id: string, formData: FormData) {
  await requireAdmin();
  const data = readForm(formData);
  if (!data.email || !data.fullName) {
    throw new Error("Name and email are required.");
  }
  await db
    .update(employees)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(employees.id, id));
  revalidatePath("/team");
  redirect("/team");
}

export async function deleteEmployee(id: string) {
  await requireAdmin();
  await db.delete(employees).where(eq(employees.id, id));
  revalidatePath("/team");
}
