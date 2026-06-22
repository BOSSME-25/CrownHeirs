import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import {
  checklistItems,
  checklistTemplates,
  dailyTasks,
  employees,
  taskReassignments,
} from "@/lib/db/schema";
import type { ChecklistItem, ChecklistTemplate, DailyTask } from "@/lib/db/schema";
import { getDefaultOrg } from "@/lib/org";

export * from "@/lib/duties-constants";

export type TemplateWithItems = ChecklistTemplate & { items: ChecklistItem[] };

export async function listTemplates(): Promise<TemplateWithItems[]> {
  const org = await getDefaultOrg();
  const tpls = org
    ? await db
        .select()
        .from(checklistTemplates)
        .where(eq(checklistTemplates.orgId, org.id))
        .orderBy(asc(checklistTemplates.section), asc(checklistTemplates.sortOrder), asc(checklistTemplates.name))
    : await db.select().from(checklistTemplates).orderBy(asc(checklistTemplates.name));
  if (tpls.length === 0) return [];
  const items = await db
    .select()
    .from(checklistItems)
    .where(inArray(checklistItems.templateId, tpls.map((t) => t.id)))
    .orderBy(asc(checklistItems.sortOrder), asc(checklistItems.createdAt));
  return tpls.map((t) => ({ ...t, items: items.filter((i) => i.templateId === t.id) }));
}

export async function getTemplate(id: string): Promise<TemplateWithItems | undefined> {
  const rows = await db.select().from(checklistTemplates).where(eq(checklistTemplates.id, id));
  const tpl = rows[0];
  if (!tpl) return undefined;
  const items = await db
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.templateId, id))
    .orderBy(asc(checklistItems.sortOrder), asc(checklistItems.createdAt));
  return { ...tpl, items };
}

export type TemplateMeta = { id: string; name: string; description: string | null; section: string };

// Lightweight template list (no items) so the board can show a checklist's
// description to everyone, not just managers.
export async function listTemplateMeta(): Promise<TemplateMeta[]> {
  const org = await getDefaultOrg();
  const base = db
    .select({
      id: checklistTemplates.id,
      name: checklistTemplates.name,
      description: checklistTemplates.description,
      section: checklistTemplates.section,
    })
    .from(checklistTemplates);
  if (!org) return base;
  return base.where(eq(checklistTemplates.orgId, org.id));
}

export type TaskRow = {
  task: DailyTask;
  assigneeName: string | null;
  ackName: string | null;
};

// All duties for a given date, with assignee + acknowledger names.
export async function getTasksForDate(date: string): Promise<TaskRow[]> {
  const org = await getDefaultOrg();
  const assignee = alias(employees, "assignee");
  const ack = alias(employees, "ack");
  const where = org
    ? and(eq(dailyTasks.orgId, org.id), eq(dailyTasks.taskDate, date))
    : eq(dailyTasks.taskDate, date);
  return db
    .select({ task: dailyTasks, assigneeName: assignee.fullName, ackName: ack.fullName })
    .from(dailyTasks)
    .leftJoin(assignee, eq(dailyTasks.assigneeId, assignee.id))
    .leftJoin(ack, eq(dailyTasks.acknowledgedById, ack.id))
    .where(where)
    .orderBy(asc(dailyTasks.section), asc(dailyTasks.sortOrder), asc(dailyTasks.createdAt));
}

export type ReassignRow = {
  r: typeof taskReassignments.$inferSelect;
  requesterName: string | null;
  targetName: string | null;
  taskTitle: string;
};

// In-flight handoffs (awaiting acceptance or manager approval) for a set of tasks.
export async function activeReassignments(taskIds: string[]): Promise<ReassignRow[]> {
  if (taskIds.length === 0) return [];
  const req = alias(employees, "req");
  const tgt = alias(employees, "tgt");
  return db
    .select({ r: taskReassignments, requesterName: req.fullName, targetName: tgt.fullName, taskTitle: dailyTasks.title })
    .from(taskReassignments)
    .leftJoin(req, eq(taskReassignments.requestedById, req.id))
    .leftJoin(tgt, eq(taskReassignments.targetEmployeeId, tgt.id))
    .leftJoin(dailyTasks, eq(taskReassignments.taskId, dailyTasks.id))
    .where(
      and(
        inArray(taskReassignments.taskId, taskIds),
        inArray(taskReassignments.status, ["pending_accept", "accepted"]),
      ),
    ) as unknown as Promise<ReassignRow[]>;
}
