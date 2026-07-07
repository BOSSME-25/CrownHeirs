"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import { db } from "@/lib/db";
import { onboardingProgress, onboardingTasks } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";
import { getDefaultOrg } from "@/lib/org";

async function requireSystem() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canSystem) throw new Error("Only the CEO/COO can edit the onboarding checklist.");
}

export async function toggleOnboardingTask(taskId: string) {
  const session = await auth();
  const me = await getEmployeeByEmail(session?.user?.email ?? "");
  if (!me) throw new Error("You’re not on the team roster yet.");
  const existing = (
    await db
      .select()
      .from(onboardingProgress)
      .where(and(eq(onboardingProgress.taskId, taskId), eq(onboardingProgress.employeeId, me.id)))
  )[0];
  if (existing) {
    await db
      .update(onboardingProgress)
      .set({ done: !existing.done, doneAt: !existing.done ? new Date() : null })
      .where(eq(onboardingProgress.id, existing.id));
  } else {
    await db.insert(onboardingProgress).values({ taskId, employeeId: me.id, done: true, doneAt: new Date() });
  }
  revalidatePath("/onboarding");
}

export async function addOnboardingTask(formData: FormData) {
  await requireSystem();
  const org = await getDefaultOrg();
  const get = (k: string) => {
    const v = formData.get(k);
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? null : s;
  };
  const title = get("title");
  if (!title) throw new Error("Task title is required.");
  await db.insert(onboardingTasks).values({ orgId: org?.id ?? null, title, description: get("description") });
  revalidatePath("/onboarding");
  redirect(`/onboarding?ok=${encodeURIComponent("Task added")}`);
}

export async function deleteOnboardingTask(id: string) {
  await requireSystem();
  await db.delete(onboardingTasks).where(eq(onboardingTasks.id, id));
  revalidatePath("/onboarding");
  redirect(`/onboarding?ok=${encodeURIComponent("Task removed")}`);
}
