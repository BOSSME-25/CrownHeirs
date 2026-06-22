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
import type { DailyTask } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";
import { getDefaultOrg } from "@/lib/org";
import { getAccess } from "@/lib/perms";
import { logAudit } from "@/lib/audit";
import { adminEmails, emailLayout, sendEmail } from "@/lib/email";
import { DUTY_SECTION_IDS, normalizeRole } from "@/lib/duties-constants";
import { resolveAutoAssignees } from "@/lib/duties";

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

// The assignee dropdown can carry a real employee id, or a special token:
//   __opener__ / __closer__       → follow the day's first/last appointment
//   __title_each__:<title>        → one copy per person with that job title
//   __title_shared__:<title>      → shared duty anyone with that title completes
//   __role_each__:<role>          → one copy per person with that access role
//   __role_shared__:<role>        → shared duty anyone with that access role completes
type ParsedAssignee = {
  assigneeId: string | null;
  autoRole: string | null;
  assigneeTitle: string | null; // shared by job title
  fanoutTitle: string | null; // one-per-person by job title
  assigneeRole: string | null; // shared by access role
  fanoutRole: string | null; // one-per-person by access role
};
function parseAssignee(raw: string | null): ParsedAssignee {
  const base: ParsedAssignee = {
    assigneeId: null, autoRole: null, assigneeTitle: null, fanoutTitle: null, assigneeRole: null, fanoutRole: null,
  };
  if (raw === "__opener__") return { ...base, autoRole: "opener" };
  if (raw === "__closer__") return { ...base, autoRole: "closer" };
  if (raw?.startsWith("__title_each__:")) return { ...base, fanoutTitle: raw.slice("__title_each__:".length) };
  if (raw?.startsWith("__title_shared__:")) return { ...base, assigneeTitle: raw.slice("__title_shared__:".length) };
  if (raw?.startsWith("__role_each__:")) return { ...base, fanoutRole: normalizeRole(raw.slice("__role_each__:".length)) };
  if (raw?.startsWith("__role_shared__:")) return { ...base, assigneeRole: normalizeRole(raw.slice("__role_shared__:".length)) };
  return { ...base, assigneeId: raw };
}

// Active employees holding a given job title (used to fan a duty out per person).
async function employeesWithTitle(title: string): Promise<{ id: string }[]> {
  const rows = await db
    .select({ id: employees.id, title: employees.jobTitle, status: employees.status })
    .from(employees);
  return rows
    .filter((r) => r.status === "active" && (r.title ?? "").trim().toLowerCase() === title.trim().toLowerCase())
    .map((r) => ({ id: r.id }));
}

// Active employees with a given access role (legacy "admin" counts as director).
async function employeesWithRole(role: string): Promise<{ id: string }[]> {
  const rows = await db
    .select({ id: employees.id, role: employees.role, status: employees.status })
    .from(employees);
  return rows
    .filter((r) => r.status === "active" && normalizeRole(r.role) === normalizeRole(role))
    .map((r) => ({ id: r.id }));
}

// The fixed per-person targets to fan a duty out to, or null when not a fan-out.
// Returns [null] when no one matches, so the duty still appears (unassigned).
async function fanoutTargets(p: ParsedAssignee): Promise<(string | null)[] | null> {
  const people = p.fanoutTitle
    ? await employeesWithTitle(p.fanoutTitle)
    : p.fanoutRole
      ? await employeesWithRole(p.fanoutRole)
      : null;
  if (!people) return null;
  return people.length ? people.map((x) => x.id) : [null];
}

// Who a duty currently belongs to: a fixed assignee, or the live opener/closer
// resolved from the day's appointments.
async function effectiveAssigneeId(task: DailyTask): Promise<string | null> {
  if (task.assigneeId) return task.assigneeId;
  if (task.autoRole === "opener" || task.autoRole === "closer") {
    const auto = await resolveAutoAssignees(task.taskDate);
    return (task.autoRole === "opener" ? auto.opener?.id : auto.closer?.id) ?? null;
  }
  return null;
}

// Can this person complete/acknowledge the duty? The assigned person (fixed or
// live opener/closer), anyone holding a shared duty's job title, or a manager.
async function canComplete(
  task: DailyTask,
  emp: { id: string; jobTitle: string | null; role: string | null },
  isManager: boolean,
): Promise<boolean> {
  if (isManager) return true;
  if (task.assigneeTitle) {
    return !!emp.jobTitle && emp.jobTitle.trim().toLowerCase() === task.assigneeTitle.trim().toLowerCase();
  }
  if (task.assigneeRole) {
    return normalizeRole(emp.role) === normalizeRole(task.assigneeRole);
  }
  return (await effectiveAssigneeId(task)) === emp.id;
}

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
  const raw = str(formData, "assigneeId");
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
  // "__default__" → fall back to the checklist's own default assignment.
  const effRaw = raw === "__default__" || raw === null ? tpl.defaultAssignee ?? "" : raw;
  const p = parseAssignee(effRaw === "" ? null : effRaw);
  // With nothing chosen, Opening/Closing default to following the day's bookings.
  const nothing = !p.assigneeId && !p.autoRole && !p.assigneeTitle && !p.fanoutTitle && !p.assigneeRole && !p.fanoutRole;
  if (nothing) {
    if (sec === "opening") p.autoRole = "opener";
    else if (sec === "closing") p.autoRole = "closer";
  }
  const baseRow = (it: (typeof items)[number], i: number) => ({
    orgId: org?.id ?? null,
    taskDate: date,
    section: sec,
    title: it.title,
    detail: it.detail,
    groupLabel: it.groupLabel,
    assignedBy: actor,
    sortOrder: String(i),
    templateId,
  });

  const targets = await fanoutTargets(p);
  if (targets) {
    const rows = items.flatMap((it, i) => targets.map((assigneeId) => ({ ...baseRow(it, i), assigneeId })));
    await db.insert(dailyTasks).values(rows);
  } else {
    await db.insert(dailyTasks).values(
      items.map((it, i) => ({
        ...baseRow(it, i),
        assigneeId: p.assigneeId,
        autoRole: p.autoRole,
        assigneeTitle: p.assigneeTitle,
        assigneeRole: p.assigneeRole,
      })),
    );
  }
  if (p.assigneeId) {
    await notify(p.assigneeId, `Duties assigned — ${tpl.name}`,
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
  const p = parseAssignee(str(formData, "assigneeId"));
  const sec = section(str(formData, "section"));
  const org = await getDefaultOrg();

  const [{ m } = { m: null }] = await db
    .select({ m: max(dailyTasks.sortOrder) })
    .from(dailyTasks)
    .where(and(eq(dailyTasks.taskDate, date), eq(dailyTasks.section, sec)));
  const sortOrder = String((Number(m) || 0) + 1);
  const common = {
    orgId: org?.id ?? null,
    taskDate: date,
    section: sec,
    title,
    detail: str(formData, "detail"),
    assignedBy: actor,
    sortOrder,
  };

  const targets = await fanoutTargets(p);
  if (targets) {
    await db.insert(dailyTasks).values(targets.map((assigneeId) => ({ ...common, assigneeId })));
  } else {
    await db.insert(dailyTasks).values({
      ...common,
      assigneeId: p.assigneeId,
      autoRole: p.autoRole,
      assigneeTitle: p.assigneeTitle,
      assigneeRole: p.assigneeRole,
    });
    if (p.assigneeId) {
      await notify(p.assigneeId, "New duty assigned", `You've been assigned: <strong>${title}</strong> for ${date}.`);
    }
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
  const p = parseAssignee(str(formData, "assigneeId"));
  // "Each person" fan-out is a build-time choice; treat it as shared here.
  const assigneeTitle = p.assigneeTitle ?? p.fanoutTitle;
  const assigneeRole = p.assigneeRole ?? p.fanoutRole;
  await db
    .update(dailyTasks)
    .set({ assigneeId: p.assigneeId, autoRole: p.autoRole, assigneeTitle, assigneeRole })
    .where(eq(dailyTasks.id, taskId));
  if (p.assigneeId) {
    await notify(p.assigneeId, "Duty assigned to you", `A duty was assigned to you for ${date}.`);
  }
  await logAudit({ actorEmail: actor, action: "update", entity: "daily_tasks", entityId: taskId, detail: "assignee changed" });
  revalidatePath("/duties");
  const msg = p.autoRole === "opener" ? "Set to the opening stylist"
    : p.autoRole === "closer" ? "Set to the closing stylist"
    : assigneeTitle ? `Set to any ${assigneeTitle}`
    : assigneeRole ? `Set to any ${assigneeRole}`
    : p.assigneeId ? "Duty assigned" : "Duty unassigned";
  back(date, msg);
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
  // The assigned person (fixed, live opener/closer, or anyone with the duty's
  // job title) acknowledges; managers may override.
  if (!(await canComplete(task, emp, access.canApprove))) {
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
  if (!(await canComplete(task, emp, access.canApprove))) {
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
  if (task.assigneeTitle || task.assigneeRole) throw new Error("Shared role duties can't be handed off — a manager can reassign them.");
  if ((await effectiveAssigneeId(task)) !== emp.id) throw new Error("You can only hand off duties assigned to you.");

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
    // A handoff fixes the duty to a person, so it stops following bookings/titles/roles.
    await db.update(dailyTasks).set({ assigneeId: r.targetEmployeeId, autoRole: null, assigneeTitle: null, assigneeRole: null }).where(eq(dailyTasks.id, r.taskId));
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
