"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, asc, eq, max } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { checklistItems, checklistTemplates } from "@/lib/db/schema";
import { getDefaultOrg } from "@/lib/org";
import { getAccess } from "@/lib/perms";
import { logAudit } from "@/lib/audit";

async function requireManage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canApprove) throw new Error("Only Bethany, Emily, a director or a manager can manage checklists.");
  return session?.user?.email ?? null;
}

const str = (formData: FormData, k: string) => {
  const v = formData.get(k);
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};

const back = (msg: string) => redirect(`/duties/templates?ok=${encodeURIComponent(msg)}`);

const sectionOf = (v: string | null) => (v === "closing" ? "closing" : v === "opening" ? "opening" : "other");

export async function createTemplate(formData: FormData) {
  const actor = await requireManage();
  const name = str(formData, "name");
  if (!name) throw new Error("Give the checklist a name.");
  const org = await getDefaultOrg();
  await db.insert(checklistTemplates).values({
    orgId: org?.id ?? null,
    name,
    description: str(formData, "description"),
    section: sectionOf(str(formData, "section")),
  });
  await logAudit({ actorEmail: actor, action: "create", entity: "checklist_template", detail: name });
  revalidatePath("/duties/templates");
  back("Checklist created");
}

export async function renameTemplate(formData: FormData) {
  const actor = await requireManage();
  const id = str(formData, "templateId");
  const name = str(formData, "name");
  if (!id || !name) throw new Error("Name is required.");
  await db
    .update(checklistTemplates)
    .set({ name, description: str(formData, "description"), section: sectionOf(str(formData, "section")) })
    .where(eq(checklistTemplates.id, id));
  await logAudit({ actorEmail: actor, action: "update", entity: "checklist_template", entityId: id });
  revalidatePath("/duties/templates");
  back("Checklist updated");
}

export async function deleteTemplate(formData: FormData) {
  const actor = await requireManage();
  const id = str(formData, "templateId");
  if (!id) throw new Error("Missing checklist.");
  await db.delete(checklistTemplates).where(eq(checklistTemplates.id, id));
  await logAudit({ actorEmail: actor, action: "delete", entity: "checklist_template", entityId: id });
  revalidatePath("/duties/templates");
  back("Checklist deleted");
}

export async function addItem(formData: FormData) {
  const actor = await requireManage();
  const templateId = str(formData, "templateId");
  const title = str(formData, "title");
  if (!templateId || !title) throw new Error("An item is required.");
  const [{ m } = { m: null }] = await db
    .select({ m: max(checklistItems.sortOrder) })
    .from(checklistItems)
    .where(eq(checklistItems.templateId, templateId));
  await db.insert(checklistItems).values({
    templateId,
    title,
    detail: str(formData, "detail"),
    groupLabel: str(formData, "groupLabel"),
    sortOrder: String((Number(m) || 0) + 1),
  });
  await logAudit({ actorEmail: actor, action: "create", entity: "checklist_item", entityId: templateId });
  revalidatePath("/duties/templates");
  back("Item added");
}

export async function updateItem(formData: FormData) {
  const actor = await requireManage();
  const id = str(formData, "itemId");
  const title = str(formData, "title");
  if (!id || !title) throw new Error("Item text is required.");
  await db
    .update(checklistItems)
    .set({ title, detail: str(formData, "detail"), groupLabel: str(formData, "groupLabel") })
    .where(eq(checklistItems.id, id));
  await logAudit({ actorEmail: actor, action: "update", entity: "checklist_item", entityId: id });
  revalidatePath("/duties/templates");
  back("Item saved");
}

export async function deleteItem(formData: FormData) {
  const actor = await requireManage();
  const id = str(formData, "itemId");
  if (!id) throw new Error("Missing item.");
  await db.delete(checklistItems).where(eq(checklistItems.id, id));
  await logAudit({ actorEmail: actor, action: "delete", entity: "checklist_item", entityId: id });
  revalidatePath("/duties/templates");
  back("Item removed");
}

// Move an item up or down within its checklist (swap sort_order with neighbor).
export async function moveItem(formData: FormData) {
  await requireManage();
  const id = str(formData, "itemId");
  const dir = str(formData, "dir"); // up | down
  if (!id) throw new Error("Missing item.");
  const item = (await db.select().from(checklistItems).where(eq(checklistItems.id, id)))[0];
  if (!item) throw new Error("Item not found.");
  const siblings = await db
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.templateId, item.templateId))
    .orderBy(asc(checklistItems.sortOrder), asc(checklistItems.createdAt));
  const idx = siblings.findIndex((s) => s.id === id);
  const swapWith = dir === "up" ? siblings[idx - 1] : siblings[idx + 1];
  if (swapWith) {
    await db.update(checklistItems).set({ sortOrder: swapWith.sortOrder ?? "0" }).where(eq(checklistItems.id, id));
    await db.update(checklistItems).set({ sortOrder: item.sortOrder ?? "0" }).where(eq(checklistItems.id, swapWith.id));
  }
  revalidatePath("/duties/templates");
  back("Reordered");
}
