"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, gte, lte } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { db } from "@/lib/db";
import { shifts } from "@/lib/db/schema";
import { addDays } from "@/lib/schedule";

async function requireAdmin() {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    throw new Error("Only admins can manage the schedule.");
  }
}

function readForm(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? null : s;
  };
  return {
    employeeId: get("employeeId"),
    shiftDate: get("shiftDate"),
    startTime: get("startTime"),
    endTime: get("endTime"),
    position: get("position"),
    notes: get("notes"),
  };
}

function backToWeek(shiftDate: string | null): string {
  return shiftDate ? `/schedule?week=${shiftDate}` : "/schedule";
}

export async function createShift(formData: FormData) {
  await requireAdmin();
  const d = readForm(formData);
  if (!d.employeeId || !d.shiftDate || !d.startTime || !d.endTime) {
    throw new Error("Employee, date, start and end time are required.");
  }
  await db.insert(shifts).values({
    employeeId: d.employeeId,
    shiftDate: d.shiftDate,
    startTime: d.startTime,
    endTime: d.endTime,
    position: d.position,
    notes: d.notes,
  });
  revalidatePath("/schedule");
  redirect(backToWeek(d.shiftDate));
}

export async function updateShift(id: string, formData: FormData) {
  await requireAdmin();
  const d = readForm(formData);
  if (!d.employeeId || !d.shiftDate || !d.startTime || !d.endTime) {
    throw new Error("Employee, date, start and end time are required.");
  }
  await db
    .update(shifts)
    .set({
      employeeId: d.employeeId,
      shiftDate: d.shiftDate,
      startTime: d.startTime,
      endTime: d.endTime,
      position: d.position,
      notes: d.notes,
    })
    .where(eq(shifts.id, id));
  revalidatePath("/schedule");
  redirect(backToWeek(d.shiftDate));
}

export async function deleteShift(id: string) {
  await requireAdmin();
  await db.delete(shifts).where(eq(shifts.id, id));
  revalidatePath("/schedule");
}

/** Publish every shift in the given week so staff can see it. */
export async function publishWeek(weekStartYMD: string) {
  await requireAdmin();
  const end = addDays(weekStartYMD, 6);
  await db
    .update(shifts)
    .set({ published: true })
    .where(and(gte(shifts.shiftDate, weekStartYMD), lte(shifts.shiftDate, end)));
  revalidatePath("/schedule");
}
