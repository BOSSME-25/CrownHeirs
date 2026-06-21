"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, gte, lte } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { db } from "@/lib/db";
import { employees, shiftDuties, shifts, swapRequests } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";
import { addDays } from "@/lib/schedule";
import { adminEmails, emailLayout, sendEmail } from "@/lib/email";

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

function parseDuties(formData: FormData): string[] {
  const raw = formData.get("duties");
  if (typeof raw !== "string") return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function createShift(formData: FormData) {
  await requireAdmin();
  const d = readForm(formData);
  if (!d.employeeId || !d.shiftDate || !d.startTime || !d.endTime) {
    throw new Error("Employee, date, start and end time are required.");
  }
  const [created] = await db
    .insert(shifts)
    .values({
      employeeId: d.employeeId,
      shiftDate: d.shiftDate,
      startTime: d.startTime,
      endTime: d.endTime,
      position: d.position,
      notes: d.notes,
    })
    .returning({ id: shifts.id });

  const duties = parseDuties(formData);
  if (created && duties.length) {
    await db.insert(shiftDuties).values(
      duties.map((description, i) => ({
        shiftId: created.id,
        description,
        sortOrder: String(i),
      })),
    );
  }

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

  // Notify staff who have shifts this week.
  const rows = await db
    .select({ email: employees.email })
    .from(shifts)
    .innerJoin(employees, eq(shifts.employeeId, employees.id))
    .where(and(gte(shifts.shiftDate, weekStartYMD), lte(shifts.shiftDate, end)));
  const emails = [...new Set(rows.map((r) => r.email))];
  await sendEmail({
    to: emails,
    subject: "This week’s schedule is posted",
    html: emailLayout(
      "Schedule posted",
      `The schedule for the week of ${weekStartYMD} has been published. Check your shifts in the Team Hub.`,
      "/schedule",
    ),
  });
  revalidatePath("/schedule");
}

// ── Duties ──

export async function addDuty(shiftId: string, formData: FormData) {
  await requireAdmin();
  const description = String(formData.get("description") ?? "").trim();
  if (!description) return;
  await db.insert(shiftDuties).values({ shiftId, description });
  revalidatePath(`/schedule/${shiftId}`);
}

export async function deleteDuty(shiftId: string, dutyId: string) {
  await requireAdmin();
  await db.delete(shiftDuties).where(eq(shiftDuties.id, dutyId));
  revalidatePath(`/schedule/${shiftId}`);
}

/** Toggle a duty's done state. Allowed for admins or the assigned employee. */
export async function toggleDuty(shiftId: string, dutyId: string, done: boolean) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) throw new Error("Not signed in.");

  if (!isAdmin(email)) {
    // Must be the employee assigned to this shift.
    const rows = await db
      .select({ assignee: employees.email })
      .from(shifts)
      .innerJoin(employees, eq(shifts.employeeId, employees.id))
      .where(eq(shifts.id, shiftId));
    if (rows[0]?.assignee?.toLowerCase() !== email) {
      throw new Error("You can only update duties on your own shift.");
    }
  }

  await db.update(shiftDuties).set({ done }).where(eq(shiftDuties.id, dutyId));
  revalidatePath(`/schedule/${shiftId}`);
}

// ── Shift swaps ──

export async function requestSwap(shiftId: string, formData: FormData) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Not signed in.");

  const [s] = await db
    .select({ employeeId: shifts.employeeId })
    .from(shifts)
    .where(eq(shifts.id, shiftId));
  if (!s) throw new Error("Shift not found.");

  const me = await getEmployeeByEmail(email);
  if (!isAdmin(email) && (!me || me.id !== s.employeeId)) {
    throw new Error("You can only request a swap for your own shift.");
  }

  const existing = await db
    .select({ id: swapRequests.id })
    .from(swapRequests)
    .where(and(eq(swapRequests.shiftId, shiftId), eq(swapRequests.status, "pending")));
  if (existing.length) throw new Error("There's already a pending swap for this shift.");

  const target = formData.get("targetEmployeeId");
  const reason = formData.get("reason");
  await db.insert(swapRequests).values({
    shiftId,
    requestedById: s.employeeId,
    targetEmployeeId: typeof target === "string" && target ? target : null,
    reason: typeof reason === "string" && reason.trim() ? reason.trim() : null,
  });

  const info = await db
    .select({ date: shifts.shiftDate, name: employees.fullName })
    .from(shifts)
    .innerJoin(employees, eq(shifts.employeeId, employees.id))
    .where(eq(shifts.id, shiftId));
  if (info[0]) {
    await sendEmail({
      to: adminEmails(),
      subject: `Shift swap requested — ${info[0].name}`,
      html: emailLayout(
        "Shift swap requested",
        `<strong>${info[0].name}</strong> requested a swap for their shift on ${info[0].date}.`,
        `/schedule/${shiftId}`,
      ),
    });
  }
  revalidatePath(`/schedule/${shiftId}`);
  revalidatePath("/schedule");
}

export async function decideSwap(swapId: string, approve: boolean, formData: FormData) {
  await requireAdmin();
  const session = await auth();
  const [swap] = await db.select().from(swapRequests).where(eq(swapRequests.id, swapId));
  if (!swap) throw new Error("Request not found.");

  if (approve) {
    const chosen = formData.get("targetEmployeeId");
    const targetId = typeof chosen === "string" && chosen ? chosen : swap.targetEmployeeId;
    if (!targetId) throw new Error("Choose who will take the shift.");
    await db.update(shifts).set({ employeeId: targetId }).where(eq(shifts.id, swap.shiftId));
    await db
      .update(swapRequests)
      .set({ status: "approved", targetEmployeeId: targetId, decidedBy: session?.user?.email, decidedAt: new Date() })
      .where(eq(swapRequests.id, swapId));
  } else {
    await db
      .update(swapRequests)
      .set({ status: "denied", decidedBy: session?.user?.email, decidedAt: new Date() })
      .where(eq(swapRequests.id, swapId));
  }

  // Notify the staffer who requested the swap.
  const reqRows = await db
    .select({ email: employees.email, name: employees.fullName })
    .from(employees)
    .where(eq(employees.id, swap.requestedById));
  if (reqRows[0]) {
    await sendEmail({
      to: reqRows[0].email,
      subject: `Your shift swap was ${approve ? "approved" : "denied"}`,
      html: emailLayout(
        `Swap ${approve ? "approved" : "denied"}`,
        `Hi ${reqRows[0].name.split(" ")[0]}, your shift swap request was <strong>${approve ? "approved" : "denied"}</strong>.`,
        "/schedule",
      ),
    });
  }
  revalidatePath(`/schedule/${swap.shiftId}`);
  revalidatePath("/schedule");
}
