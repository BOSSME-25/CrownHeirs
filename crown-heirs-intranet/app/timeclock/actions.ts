"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import { db } from "@/lib/db";
import { timeEntries } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";
import { getDefaultOrg } from "@/lib/org";
import { azDateTime } from "@/lib/timeclock";
import { logAudit } from "@/lib/audit";

async function me() {
  const session = await auth();
  const employee = await getEmployeeByEmail(session?.user?.email ?? "");
  return { email: session?.user?.email ?? null, employee };
}

async function openEntryFor(employeeId: string) {
  return (
    await db
      .select()
      .from(timeEntries)
      .where(and(eq(timeEntries.employeeId, employeeId), isNull(timeEntries.clockOut)))
  )[0];
}

export async function clockIn() {
  const { employee } = await me();
  if (!employee) throw new Error("You’re not on the team roster yet.");
  if (await openEntryFor(employee.id)) {
    redirect(`/timeclock?ok=${encodeURIComponent("You’re already clocked in")}`);
  }
  const org = await getDefaultOrg();
  await db.insert(timeEntries).values({
    orgId: org?.id ?? null,
    locationId: employee.locationId ?? null,
    employeeId: employee.id,
    clockIn: new Date(),
  });
  revalidatePath("/timeclock");
  redirect(`/timeclock?ok=${encodeURIComponent("Clocked in")}`);
}

export async function clockOut(formData: FormData) {
  const { employee } = await me();
  if (!employee) throw new Error("You’re not on the team roster yet.");
  const open = await openEntryFor(employee.id);
  if (!open) redirect(`/timeclock?ok=${encodeURIComponent("You’re not clocked in")}`);
  const breakRaw = formData.get("breakMinutes");
  const breakMinutes = Math.max(0, Number(breakRaw) || 0);
  await db
    .update(timeEntries)
    .set({ clockOut: new Date(), breakMinutes })
    .where(eq(timeEntries.id, open.id));
  revalidatePath("/timeclock");
  redirect(`/timeclock?ok=${encodeURIComponent("Clocked out")}`);
}

// ── Manager corrections ──

async function requireManage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canManageTeam) throw new Error("Only managers and above can edit timesheets.");
  return session?.user?.email ?? null;
}

export async function addManualEntry(formData: FormData) {
  const actor = await requireManage();
  const org = await getDefaultOrg();
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const employeeId = get("employeeId");
  const date = get("date");
  const inT = get("startTime");
  const outT = get("endTime");
  if (!employeeId || !date || !inT || !outT) {
    throw new Error("Team member, date, start and end time are required.");
  }
  await db.insert(timeEntries).values({
    orgId: org?.id ?? null,
    employeeId,
    clockIn: azDateTime(date, inT),
    clockOut: azDateTime(date, outT),
    breakMinutes: Math.max(0, Number(get("breakMinutes")) || 0),
    note: get("note") || null,
    editedBy: actor,
  });
  await logAudit({ actorEmail: actor, action: "create", entity: "time_entry", detail: `${date} ${inT}-${outT}` });
  revalidatePath("/timeclock");
  redirect(`/timeclock?ok=${encodeURIComponent("Entry added")}`);
}

export async function deleteEntry(id: string) {
  const actor = await requireManage();
  await db.delete(timeEntries).where(eq(timeEntries.id, id));
  await logAudit({ actorEmail: actor, action: "delete", entity: "time_entry", entityId: id });
  revalidatePath("/timeclock");
  redirect(`/timeclock?ok=${encodeURIComponent("Entry deleted")}`);
}
