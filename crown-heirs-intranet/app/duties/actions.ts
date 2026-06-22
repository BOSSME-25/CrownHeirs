"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, inArray, max } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  checklistItems,
  checklistTemplates,
  dailyTasks,
  employees,
  taskReassignments,
} from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";
import { getDefaultOrg } from "@/lib/org";
import { getAccess } from "@/lib/perms";
import { logAudit } from "@/lib/audit";
import { adminEmails, emailLayout, sendEmail } from "@/lib/email";
import { DUTY_SECTION_IDS } from "@/lib/duties-constants";

const back = (date: string, msg: string) =>
  redirect(`/duties?d=${encodeURIComponent(date)}&ok=${encodeURIComponent(msg)}`);

async function requireManage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canApprove) throw new Error("Only Bethany, Emily, a director or a manager can do this.");
  return session?.user?.email ?? null;
}

async function me() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Not signed in.");
  const emp = await getEmployeeByEmail(email);
  if (!emp) throw new Error("You're not on the team roster yet. Ask an admin to add you first.");
  return { email, emp };
}

const str = (formData: FormData, k: string) => {
  const v = formData.get(k);
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};

const section = (v: string | null) => (v && DUTY_SECTION_IDS.includes(v) ? v : "other");

async function notify(employeeId: string | null | undefined, subject: string, body: string) {
  if (!employeeId) return;
  try {
    const emp = (await db.select().from(employees).where(eq(employees.id, employeeId)))[0];
    if (emp?.email) {
      await sendEmail({ to: emp.email, subject, html: emailLayout(subject, body, "/duties") });
    }
  } catch {
    // best-effort
  }
}

// ── Building the day ──

// Drop a whole checklist template onto a date (one duty per item).
export async function applyTemplate(formData: FormData) {
  const actor = await requireManage();
  const templateId = str(formData, "templateId");
  const date = str(formData, "taskDate");
  const defaultAssignee = str(formData, "assigneeId");
  if (!templateId || !date) throw new Error("Pick a checklist and a date.");

  const tpl = (await db.select().from(checklistTemplates).where(eq(checklistTemplates.id, templateId)))[0];
  if (!tpl) throw new Error("Checklist not found.");
  const items = await db
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.templateId, templateId))
    .orderBy(asc(checklistItems.sortOrder), asc(checklistItems.createdAt));
  if (items.length === 0) throw new Error("That checklist has no items yet.");

  const org = await getDefaultOrg();
  const sec = ["opening", "endshift", "closing"].includes(tpl.section) ? tpl.section : "other";
  await db.insert(dailyTasks).values(
    items.map((it, i) => ({
      orgId: org?.id ?? null,
      taskDate: date,
      section: sec,
      title: it.title,
      detail: it.detail,
      groupLabel: it.groupLabel,
      assigneeId: defaultAssignee ?? null,
      assignedBy: actor,
      sortOrder: String(i),
      templateId,
    })),
  );
  if (defaultAssignee) {
    await notify(defaultAssignee, `Duties assigned — ${tpl.name}`,
      `You've been assigned the <strong>${tpl.name}</strong> (${items.length} items) for ${date}.`);
  }
  await logAudit({ actorEmail: actor, action: "create", entity: "daily_tasks", detail: `${tpl.name} → ${date} (${items.length})` });
  revalidatePath("/duties");
  back(date, `Added ${tpl.name} (${items.length} items)`);
}

// Add a single ad-hoc duty / role.
export async function addDuty(formData: FormData) {
  const actor = await requireManage();
  const date = str(formData, "taskDate");
  const title = str(formData, "title");
  if (!date || !title) throw new Error("A date and a duty are required.");
  const assigneeId = str(formData, "assigneeId");
  const org = await getDefaultOrg();

  const [{ m } = { m: null }] = await db
    .select({ m: max(dailyTasks.sortOrder) })
    .from(dailyTasks)
    .where(and(eq(dailyTasks.taskDate, date), eq(dailyTasks.section, section(str(formData, "section")))));

  await db.insert(dailyTasks).values({
    orgId: org?.id ?? null,
    taskDate: date,
    section: section(str(formData, "section")),
    title,
    detail: str(formData, "detail"),
    assigneeId,
    assignedBy: actor,
    sortOrder: String((Number(m) || 0) + 1),
  });
  if (assigneeId) {
    await notify(assigneeId, "New duty assigned", `You've been assigned: <strong>${title}</strong> for ${date}.`);
  }
  await logAudit({ actorEmail: actor, action: "create", entity: "daily_tasks", detail: `${title} → ${date}` });
  revalidatePath("/duties");
  back(date, "Duty added");
}

// Manager directly (re)assigns a duty.
export async function setAssignee(formData: FormData) {
  const actor = await requireManage();
  const taskId = str(formData, "taskId");
  const date = str(formData, "taskDate") ?? "";
  if (!taskId) throw new Error("Missing duty.");
  const assigneeId = str(formData, "assigneeId");
  await db.update(dailyTasks).set({ assigneeId }).where(eq(dailyTasks.id, taskId));
  if (assigneeId) {
    await notify(assigneeId, "Duty assigned to you", `A duty was assigned to you for ${date}.`);
  }
  await logAudit({ actorEmail: actor, action: "update", entity: "daily_tasks", entityId: taskId, detail: "assignee changed" });
  revalidatePath("/duties");
  back(date, assigneeId ? "Duty assigned" : "Duty unassigned");
}

export async function deleteDuty(formData: FormData) {
  const actor = await requireManage();
  const taskId = str(formData, "taskId");
  const date = str(formData, "taskDate") ?? "";
  if (!taskId) throw new Error("Missing duty.");
  await db.delete(dailyTasks).where(eq(dailyTasks.id, taskId));
  await logAudit({ actorEmail: actor, action: "delete", entity: "daily_tasks", entityId: taskId });
  revalidatePath("/duties");
  back(date, "Duty removed");
}

// ── Acknowledgement ──

export async function acknowledgeTask(formData: FormData) {
  const { emp } = await me();
  const access = await getAccess(emp.email);
  const taskId = str(formData, "taskId");
  const date = str(formData, "taskDate") ?? "";
  if (!taskId) throw new Error("Missing duty.");
  const task = (await db.select().from(dailyTasks).where(eq(dailyTasks.id, taskId)))[0];
  if (!task) throw new Error("Duty not found.");
  // The assigned person acknowledges; managers may override.
  if (task.assigneeId !== emp.id && !access.canApprove) {
    throw new Error("Only the assigned person (or a manager) can complete this duty.");
  }
  await db
    .update(dailyTasks)
    .set({ status: "done", acknowledgedById: emp.id, acknowledgedAt: new Date() })
    .where(eq(dailyTasks.id, taskId));
  revalidatePath("/duties");
  back(date, "Marked done — thanks!");
}

export async function unacknowledgeTask(formData: FormData) {
  const { emp } = await me();
  const access = await getAccess(emp.email);
  const taskId = str(formData, "taskId");
  const date = str(formData, "taskDate") ?? "";
  if (!taskId) throw new Error("Missing duty.");
  const task = (await db.select().from(dailyTasks).where(eq(dailyTasks.id, taskId)))[0];
  if (!task) throw new Error("Duty not found.");
  if (task.assigneeId !== emp.id && !access.canApprove) {
    throw new Error("Only the assigned person (or a manager) can change this.");
  }
  await db
    .update(dailyTasks)
    .set({ status: "open", acknowledgedById: null, acknowledgedAt: null })
    .where(eq(dailyTasks.id, taskId));
  revalidatePath("/duties");
  back(date, "Reopened");
}

// ── Reassignment workflow: request → accept → manager approval ──

export async function requestReassign(formData: FormData) {
  const { emp } = await me();
  const taskId = str(formData, "taskId");
  const date = str(formData, "taskDate") ?? "";
  const targetEmployeeId = str(formData, "targetEmployeeId");
  if (!taskId || !targetEmployeeId) throw new Error("Pick a teammate to hand this to.");
  if (targetEmployeeId === emp.id) throw new Error("Pick a different teammate.");

  const task = (await db.select().from(dailyTasks).where(eq(dailyTasks.id, taskId)))[0];
  if (!task) throw new Error("Duty not found.");
  if (task.assigneeId !== emp.id) throw new Error("You can only hand off duties assigned to you.");

  // One active request per duty at a time.
  const open = await db
    .select({ id: taskReassignments.id })
    .from(taskReassignments)
    .where(and(eq(taskReassignments.taskId, taskId), inArray(taskReassignments.status, ["pending_accept", "accepted"])));
  if (open.length) throw new Error("There's already a handoff in progress for this duty.");

  await db.insert(taskReassignments).values({
    taskId,
    requestedById: emp.id,
    targetEmployeeId,
    reason: str(formData, "reason"),
  });
  await notify(targetEmployeeId, "Duty handoff request",
    `<strong>${emp.fullName}</strong> asked you to take over a duty (“${task.title}”) for ${date}. Open Daily Duties to accept or decline.`);
  await logAudit({ actorEmail: emp.email, action: "request", entity: "task_reassignment", entityId: taskId, detail: "handoff requested" });
  revalidatePath("/duties");
  back(date, "Handoff requested — your teammate must accept, then a manager approves.");
}

// Target accepts or declines.
export async function respondReassign(formData: FormData) {
  const { emp } = await me();
  const id = str(formData, "reassignId");
  const date = str(formData, "taskDate") ?? "";
  const decision = str(formData, "decision"); // accept | decline
  if (!id) throw new Error("Missing request.");
  const r = (await db.select().from(taskReassignments).where(eq(taskReassignments.id, id)))[0];
  if (!r) throw new Error("Request not found.");
  if (r.targetEmployeeId !== emp.id) throw new Error("This handoff wasn't directed to you.");
  if (r.status !== "pending_accept") throw new Error("This request is no longer pending.");

  if (decision === "accept") {
    await db.update(taskReassignments).set({ status: "accepted", acceptedAt: new Date() }).where(eq(taskReassignments.id, id));
    await sendEmail({
      to: adminEmails(),
      subject: "Duty handoff needs approval",
      html: emailLayout("Handoff awaiting approval",
        `<strong>${emp.fullName}</strong> accepted a duty handoff for ${date}. It needs a manager's approval in Daily Duties.`, "/duties"),
    });
    await notify(r.requestedById, "Handoff accepted", `${emp.fullName} accepted your handoff. A manager will approve it next.`);
    back(date, "Accepted — sent to a manager for approval.");
  } else {
    await db.update(taskReassignments).set({ status: "declined", decidedAt: new Date() }).where(eq(taskReassignments.id, id));
    await notify(r.requestedById, "Handoff declined", `${emp.fullName} declined your handoff request.`);
    back(date, "Declined.");
  }
}

// Manager approves or denies an accepted handoff.
export async function decideReassign(formData: FormData) {
  const actor = await requireManage();
  const id = str(formData, "reassignId");
  const date = str(formData, "taskDate") ?? "";
  const decision = str(formData, "decision"); // approve | deny
  if (!id) throw new Error("Missing request.");
  const r = (await db.select().from(taskReassignments).where(eq(taskReassignments.id, id)))[0];
  if (!r) throw new Error("Request not found.");
  if (r.status !== "accepted") throw new Error("Only an accepted handoff can be approved.");

  if (decision === "approve") {
    await db.update(dailyTasks).set({ assigneeId: r.targetEmployeeId }).where(eq(dailyTasks.id, r.taskId));
    await db.update(taskReassignments).set({ status: "approved", decidedBy: actor, decidedAt: new Date() }).where(eq(taskReassignments.id, id));
    await notify(r.targetEmployeeId, "Duty is now yours", `A duty handoff was approved — it's now assigned to you for ${date}.`);
    await notify(r.requestedById, "Handoff approved", "Your duty handoff was approved.");
    await logAudit({ actorEmail: actor, action: "approve", entity: "task_reassignment", entityId: r.taskId });
    back(date, "Handoff approved — duty reassigned.");
  } else {
    await db.update(taskReassignments).set({ status: "denied", decidedBy: actor, decidedAt: new Date() }).where(eq(taskReassignments.id, id));
    await notify(r.requestedById, "Handoff denied", "A manager denied your duty handoff — the duty stays with you.");
    await logAudit({ actorEmail: actor, action: "deny", entity: "task_reassignment", entityId: r.taskId });
    back(date, "Handoff denied.");
  }
}

// Requester cancels their own pending/accepted handoff.
export async function cancelReassign(formData: FormData) {
  const { emp } = await me();
  const id = str(formData, "reassignId");
  const date = str(formData, "taskDate") ?? "";
  if (!id) throw new Error("Missing request.");
  const r = (await db.select().from(taskReassignments).where(eq(taskReassignments.id, id)))[0];
  if (!r) throw new Error("Request not found.");
  if (r.requestedById !== emp.id) throw new Error("You can only cancel your own request.");
  if (!["pending_accept", "accepted"].includes(r.status)) throw new Error("This request can't be cancelled.");
  await db.update(taskReassignments).set({ status: "cancelled", decidedAt: new Date() }).where(eq(taskReassignments.id, id));
  revalidatePath("/duties");
  back(date, "Handoff cancelled.");
}
