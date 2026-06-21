"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { db } from "@/lib/db";
import { timeOffRequests } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";

export async function submitTimeOff(formData: FormData) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Not signed in.");

  const employee = await getEmployeeByEmail(email);
  if (!employee) {
    throw new Error("You’re not on the team roster yet. Ask an admin to add you first.");
  }

  const get = (k: string) => {
    const v = formData.get(k);
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? null : s;
  };
  const startDate = get("startDate");
  const endDate = get("endDate");
  if (!startDate || !endDate) throw new Error("Start and end dates are required.");
  if (endDate < startDate) throw new Error("End date can’t be before the start date.");

  await db.insert(timeOffRequests).values({
    employeeId: employee.id,
    startDate,
    endDate,
    type: get("type"),
    note: get("note"),
  });
  revalidatePath("/time-off");
}

// Admin/manager records time off directly for a team member (already approved).
export async function adminAddTimeOff(formData: FormData) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) throw new Error("Only admins can do this.");

  const get = (k: string) => {
    const v = formData.get(k);
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? null : s;
  };
  const employeeId = get("employeeId");
  const startDate = get("startDate");
  const endDate = get("endDate");
  if (!employeeId || !startDate || !endDate) {
    throw new Error("Team member, start and end dates are required.");
  }
  if (endDate < startDate) throw new Error("End date can’t be before the start date.");

  await db.insert(timeOffRequests).values({
    employeeId,
    startDate,
    endDate,
    type: get("type"),
    note: get("note"),
    status: "approved",
    decidedBy: session?.user?.email,
    decidedAt: new Date(),
  });
  revalidatePath("/time-off");
}

export async function decideTimeOff(id: string, status: "approved" | "denied") {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) throw new Error("Only admins can decide requests.");

  await db
    .update(timeOffRequests)
    .set({ status, decidedBy: session?.user?.email, decidedAt: new Date() })
    .where(eq(timeOffRequests.id, id));
  revalidatePath("/time-off");
}
