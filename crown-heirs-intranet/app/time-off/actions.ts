"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import { db } from "@/lib/db";
import { employees, ptoLedger, timeOffRequests } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";
import { getDefaultOrg } from "@/lib/org";
import { DEFAULT_HOURS_PER_DAY, daysInclusive } from "@/lib/pto";
import { adminEmails, emailLayout, sendEmail } from "@/lib/email";

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

  await sendEmail({
    to: adminEmails(),
    subject: `Time-off request — ${employee.fullName}`,
    html: emailLayout(
      "New time-off request",
      `<strong>${employee.fullName}</strong> requested time off:<br>${startDate} – ${endDate}${get("note") ? `<br><br>“${get("note")}”` : ""}`,
      "/time-off",
    ),
  });
  revalidatePath("/time-off");
  redirect(`/time-off?ok=${encodeURIComponent("Time-off request submitted")}`);
}

// Admin/manager records time off directly for a team member (already approved).
export async function adminAddTimeOff(formData: FormData) {
  const session = await auth();
  if (!(await getAccess(session?.user?.email)).canApprove) {
    throw new Error("Only managers and above can do this.");
  }

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

  const [added] = await db
    .insert(timeOffRequests)
    .values({
      employeeId,
      startDate,
      endDate,
      type: get("type"),
      note: get("note"),
      status: "approved",
      decidedBy: session?.user?.email,
      decidedAt: new Date(),
    })
    .returning({ id: timeOffRequests.id });

  // Deduct from the PTO ledger.
  const org = await getDefaultOrg();
  const hrs = daysInclusive(startDate, endDate) * DEFAULT_HOURS_PER_DAY;
  await db.insert(ptoLedger).values({
    orgId: org?.id ?? null,
    employeeId,
    hours: String(-hrs),
    kind: "usage",
    note: `Time off ${startDate}–${endDate}`,
    effectiveDate: startDate,
    requestId: added?.id,
    createdBy: session?.user?.email,
  });
  revalidatePath("/time-off");
  redirect(`/time-off?ok=${encodeURIComponent("Time off added")}`);
}

export async function decideTimeOff(id: string, status: "approved" | "denied") {
  const session = await auth();
  if (!(await getAccess(session?.user?.email)).canApprove) {
    throw new Error("Only managers and above can decide requests.");
  }

  await db
    .update(timeOffRequests)
    .set({ status, decidedBy: session?.user?.email, decidedAt: new Date() })
    .where(eq(timeOffRequests.id, id));

  // Notify the employee of the decision.
  const rows = await db
    .select({ employeeId: timeOffRequests.employeeId, email: employees.email, name: employees.fullName, start: timeOffRequests.startDate, end: timeOffRequests.endDate, type: timeOffRequests.type })
    .from(timeOffRequests)
    .innerJoin(employees, eq(timeOffRequests.employeeId, employees.id))
    .where(eq(timeOffRequests.id, id));
  const r = rows[0];

  // Keep the PTO ledger in sync with the decision.
  if (r) {
    if (status === "approved") {
      const existing = await db.select({ id: ptoLedger.id }).from(ptoLedger).where(eq(ptoLedger.requestId, id));
      if (existing.length === 0) {
        const org = await getDefaultOrg();
        const hrs = daysInclusive(r.start, r.end) * DEFAULT_HOURS_PER_DAY;
        await db.insert(ptoLedger).values({
          orgId: org?.id ?? null,
          employeeId: r.employeeId,
          hours: String(-hrs),
          kind: "usage",
          note: `Time off ${r.start}–${r.end}${r.type ? ` (${r.type})` : ""}`,
          effectiveDate: r.start,
          requestId: id,
          createdBy: session?.user?.email,
        });
      }
    } else {
      // Denied/reverted — remove any auto-deduction for this request.
      await db.delete(ptoLedger).where(eq(ptoLedger.requestId, id));
    }
  }

  if (r) {
    await sendEmail({
      to: r.email,
      subject: `Your time-off request was ${status}`,
      html: emailLayout(
        `Time off ${status}`,
        `Hi ${r.name.split(" ")[0]}, your time-off request for ${r.start} – ${r.end} was <strong>${status}</strong>.`,
        "/time-off",
      ),
    });
  }
  revalidatePath("/time-off");
  redirect(`/time-off?ok=${encodeURIComponent(`Request ${status}`)}`);
}
