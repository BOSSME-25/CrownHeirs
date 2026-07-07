"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import { db } from "@/lib/db";
import { employees, policies, policyAcks } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";
import { getDefaultOrg } from "@/lib/org";
import { logAudit } from "@/lib/audit";
import { adminEmails, emailLayout, sendEmail } from "@/lib/email";
import { ensurePolicyAssignments } from "@/lib/policies";
import { policyCategoryLabel } from "@/lib/policies-constants";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};

const back = (msg: string) => redirect(`/acknowledgments?ok=${encodeURIComponent(msg)}`);

async function notifyEmail(to: string | string[], subject: string, body: string, ctaPath = "/acknowledgments") {
  try {
    if (Array.isArray(to) && to.length === 0) return;
    await sendEmail({ to, subject, html: emailLayout(subject, body, ctaPath) });
  } catch {
    // best-effort
  }
}

async function actor() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Not signed in.");
  const emp = await getEmployeeByEmail(email);
  if (!emp) throw new Error("You’re not on the team roster yet. Ask an admin to add you first.");
  const access = await getAccess(email);
  return { email, emp, access };
}

// Email every active employee that a document needs their signature.
async function notifyTeamToSign(title: string, category: string, repush: boolean) {
  const team = await db
    .select({ email: employees.email })
    .from(employees)
    .where(eq(employees.status, "active"));
  const to = team.map((t) => t.email).filter(Boolean) as string[];
  const verb = repush ? "has been updated and needs your signature again" : "needs your signature";
  await notifyEmail(
    to,
    `Please sign: ${title}`,
    `The <strong>${policyCategoryLabel(category)}</strong> “${title}” ${verb}. Open Acknowledgments, read it, and sign — a manager will then confirm.`,
  );
}

// ── Employee: read & sign ──
export async function acknowledgePolicy(policyId: string) {
  const { email, emp } = await actor();
  const pol = (await db.select().from(policies).where(eq(policies.id, policyId)))[0];
  if (!pol || !pol.active) throw new Error("That document isn’t available.");

  const existing = (
    await db.select().from(policyAcks).where(and(eq(policyAcks.policyId, policyId), eq(policyAcks.employeeId, emp.id)))
  )[0];
  const now = new Date();
  if (!existing) {
    await db.insert(policyAcks).values({ policyId, employeeId: emp.id, version: pol.version, acknowledgedAt: now });
  } else {
    await db
      .update(policyAcks)
      .set({ version: pol.version, acknowledgedAt: now, confirmedBy: null, confirmedAt: null, lastRemindedAt: null })
      .where(eq(policyAcks.id, existing.id));
  }

  await notifyEmail(
    adminEmails(),
    `Sign-off to confirm — ${emp.fullName}`,
    `<strong>${emp.fullName}</strong> signed “${pol.title}”. Per checks and balances, a different manager must confirm it on the Acknowledgments page.`,
  );
  await logAudit({ actorEmail: email, action: "acknowledge", entity: "policy", entityId: policyId, detail: pol.title });
  revalidatePath("/acknowledgments");
  revalidatePath("/");
  back("Signed — a manager will confirm it");
}

// ── Manager: confirm a sign-off (separation of duties) ──
export async function confirmAck(formData: FormData) {
  const { email, access } = await actor();
  if (!access.canApprove) throw new Error("Only a manager or owner can confirm sign-offs.");
  const ackId = str(formData, "ackId");
  const decision = str(formData, "decision"); // confirm | reject
  if (!ackId) throw new Error("Missing record.");

  const row = (await db.select().from(policyAcks).where(eq(policyAcks.id, ackId)))[0];
  if (!row) throw new Error("Record not found.");
  const pol = (await db.select().from(policies).where(eq(policies.id, row.policyId)))[0];
  if (!pol) throw new Error("Document not found.");
  if (!row.acknowledgedAt || row.confirmedAt || row.version !== pol.version) {
    throw new Error("This sign-off isn’t awaiting confirmation.");
  }

  const employee = (await db.select().from(employees).where(eq(employees.id, row.employeeId)))[0];
  if (employee?.email && employee.email.toLowerCase() === email.toLowerCase()) {
    throw new Error("For checks and balances, someone else must confirm your own sign-off.");
  }

  if (decision === "confirm") {
    await db.update(policyAcks).set({ confirmedBy: email, confirmedAt: new Date() }).where(eq(policyAcks.id, ackId));
    await logAudit({ actorEmail: email, action: "confirm", entity: "policy", entityId: pol.id, detail: `${pol.title} — ${employee?.fullName ?? ""}` });
    back("Confirmed");
  } else {
    await db
      .update(policyAcks)
      .set({ acknowledgedAt: null, confirmedBy: null, confirmedAt: null })
      .where(eq(policyAcks.id, ackId));
    if (employee?.email) {
      await notifyEmail(
        employee.email,
        "Please re-sign",
        `A manager asked you to review and sign “${pol.title}” again. Open Acknowledgments to sign.`,
      );
    }
    await logAudit({ actorEmail: email, action: "confirm", entity: "policy", entityId: pol.id, detail: "returned" });
    back("Returned to the employee to re-sign");
  }
}

// ── Manage documents (director / owner) ──
async function requireManageDocs() {
  const { email, access } = await actor();
  if (!access.canManageTeam) throw new Error("Only a director or owner can manage documents.");
  return email;
}

export async function addPolicy(formData: FormData) {
  const actorEmail = await requireManageDocs();
  const org = await getDefaultOrg();
  const title = str(formData, "title");
  if (!title) throw new Error("Title is required.");
  const category = str(formData, "category") ?? "policy";
  await db.insert(policies).values({
    orgId: org?.id ?? null,
    title,
    body: str(formData, "body"),
    fileUrl: str(formData, "fileUrl"),
    category,
    version: 1,
  });
  await ensurePolicyAssignments();
  await notifyTeamToSign(title, category, false);
  await logAudit({ actorEmail, action: "create", entity: "policy", detail: title });
  revalidatePath("/acknowledgments");
  revalidatePath("/");
  back("Document added and sent to the team to sign");
}

export async function editPolicy(formData: FormData) {
  const actorEmail = await requireManageDocs();
  const id = str(formData, "policyId");
  if (!id) throw new Error("Missing document.");
  const title = str(formData, "title");
  if (!title) throw new Error("Title is required.");
  await db
    .update(policies)
    .set({
      title,
      body: str(formData, "body"),
      fileUrl: str(formData, "fileUrl"),
      category: str(formData, "category") ?? "policy",
      updatedAt: new Date(),
    })
    .where(eq(policies.id, id));
  await logAudit({ actorEmail, action: "update", entity: "policy", entityId: id, detail: "edited (no re-sign)" });
  revalidatePath("/acknowledgments");
  back("Document updated (no re-sign required)");
}

// Bump the version → everyone must sign again.
export async function pushUpdate(formData: FormData) {
  const actorEmail = await requireManageDocs();
  const id = str(formData, "policyId");
  if (!id) throw new Error("Missing document.");
  const pol = (await db.select().from(policies).where(eq(policies.id, id)))[0];
  if (!pol) throw new Error("Document not found.");
  await db
    .update(policies)
    .set({ version: pol.version + 1, updatedAt: new Date() })
    .where(eq(policies.id, id));
  await ensurePolicyAssignments();
  await notifyTeamToSign(pol.title, pol.category, true);
  await logAudit({ actorEmail, action: "update", entity: "policy", entityId: id, detail: `pushed v${pol.version + 1}` });
  revalidatePath("/acknowledgments");
  revalidatePath("/");
  back("Update pushed — the team will be asked to sign again");
}

export async function deactivatePolicy(id: string) {
  const actorEmail = await requireManageDocs();
  await db.update(policies).set({ active: false }).where(eq(policies.id, id));
  await logAudit({ actorEmail, action: "delete", entity: "policy", entityId: id });
  revalidatePath("/acknowledgments");
  revalidatePath("/");
  back("Document archived");
}
