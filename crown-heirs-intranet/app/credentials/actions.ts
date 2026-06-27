"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { credentials } from "@/lib/db/schema";
import type { Credential } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";
import { getDefaultOrg } from "@/lib/org";
import { getAccess } from "@/lib/perms";
import { logAudit } from "@/lib/audit";
import { adminEmails, emailLayout, sendEmail } from "@/lib/email";
import { credentialLabel, isCredentialType } from "@/lib/credentials-constants";

const CERT_MAX = 4 * 1024 * 1024;

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
  const access = await getAccess(email);
  return { email, emp, canManage: access.canApprove };
}

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};

const back = (to: string, msg: string) => redirect(`${to}?ok=${encodeURIComponent(msg)}`);

async function notifyEmail(to: string | string[], subject: string, body: string) {
  try {
    await sendEmail({ to, subject, html: emailLayout(subject, body, "/credentials") });
  } catch {
    // best-effort
  }
}

async function loadCred(id: string): Promise<Credential> {
  const row = (await db.select().from(credentials).where(eq(credentials.id, id)))[0];
  if (!row) throw new Error("Credential not found.");
  return row;
}

async function putCert(employeeId: string, type: string, file: File): Promise<string> {
  if (file.size > CERT_MAX) throw new Error("Certificate is too large (max 4 MB). Try a smaller scan or photo.");
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "certificate";
  const blob = await put(`credentials/${employeeId}/${type}/${safe}`, file, {
    access: "private",
    addRandomSuffix: true,
    contentType: file.type || undefined,
  });
  return blob.pathname;
}

// ── Manager: assign / remove / set dates directly ──

export async function assignCredential(formData: FormData) {
  const actor = await requireManage();
  const employeeId = str(formData, "employeeId");
  const type = str(formData, "type");
  if (!employeeId || !type || !isCredentialType(type)) throw new Error("Pick an employee and a credential.");
  const org = await getDefaultOrg();
  await db
    .insert(credentials)
    .values({ orgId: org?.id ?? null, employeeId, type })
    .onConflictDoNothing();
  await logAudit({ actorEmail: actor, action: "create", entity: "credential", detail: `${credentialLabel(type)}` });
  revalidatePath("/credentials");
  back("/credentials", `Added ${credentialLabel(type)}`);
}

export async function removeCredential(formData: FormData) {
  const actor = await requireManage();
  const id = str(formData, "credentialId");
  if (!id) throw new Error("Missing credential.");
  await db.delete(credentials).where(eq(credentials.id, id));
  await logAudit({ actorEmail: actor, action: "delete", entity: "credential", entityId: id });
  revalidatePath("/credentials");
  back("/credentials", "Credential removed");
}

// Manager records an existing credential's dates (and optional cert) directly,
// without the review workflow — for entering current records.
export async function setCredentialDates(formData: FormData) {
  const actor = await requireManage();
  const id = str(formData, "credentialId");
  if (!id) throw new Error("Missing credential.");
  const cred = await loadCred(id);
  const file = formData.get("file");
  let pathname = cred.certificatePathname;
  if (file instanceof File && file.size > 0) {
    pathname = await putCert(cred.employeeId, cred.type, file);
  }
  await db
    .update(credentials)
    .set({
      issuedAt: str(formData, "issuedAt"),
      expiresAt: str(formData, "expiresAt"),
      certificatePathname: pathname,
      status: "active",
      lastRemindedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(credentials.id, id));
  await logAudit({ actorEmail: actor, action: "update", entity: "credential", entityId: id, detail: "dates set" });
  revalidatePath("/credentials");
  back("/credentials", "Credential updated");
}

// ── Employee (or manager): submit a renewal for review ──

export async function submitRenewal(formData: FormData) {
  const { email, emp, canManage } = await me();
  const id = str(formData, "credentialId");
  const returnTo = str(formData, "returnTo") ?? "/me";
  if (!id) throw new Error("Missing credential.");
  const cred = await loadCred(id);
  if (cred.employeeId !== emp.id && !canManage) {
    throw new Error("You can only submit your own certificate.");
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Attach your certificate (PDF or photo).");
  const expiresAt = str(formData, "expiresAt");
  if (!expiresAt) throw new Error("Enter the new expiration date.");

  const pathname = await putCert(cred.employeeId, cred.type, file);
  await db
    .update(credentials)
    .set({
      status: "pending_review",
      pendingPathname: pathname,
      pendingIssuedAt: str(formData, "issuedAt"),
      pendingExpiresAt: expiresAt,
      pendingSubmittedAt: new Date(),
      pendingSubmittedBy: email,
      reviewedBy: null,
      reviewedAt: null,
      confirmedBy: null,
      confirmedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(credentials.id, id));

  await notifyEmail(
    adminEmails(),
    `Certificate to review — ${emp.fullName}`,
    `<strong>${emp.fullName}</strong> uploaded a renewed <strong>${credentialLabel(cred.type)}</strong> (expires ${expiresAt}). It needs a manager review in the Credentials page.`,
  );
  await logAudit({ actorEmail: email, action: "submit", entity: "credential", entityId: id, detail: credentialLabel(cred.type) });
  revalidatePath("/credentials");
  revalidatePath("/me");
  back(returnTo, "Certificate submitted for review");
}

// ── Manager: first review ──

export async function reviewRenewal(formData: FormData) {
  const actor = await requireManage();
  const id = str(formData, "credentialId");
  const decision = str(formData, "decision"); // approve | reject
  if (!id) throw new Error("Missing credential.");
  const cred = await loadCred(id);
  if (cred.status !== "pending_review") throw new Error("This credential isn't awaiting review.");

  if (decision === "approve") {
    await db
      .update(credentials)
      .set({ status: "pending_confirm", reviewedBy: actor, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(credentials.id, id));
    await notifyEmail(
      adminEmails(),
      "Certificate needs confirmation",
      `A renewed <strong>${credentialLabel(cred.type)}</strong> was reviewed by ${actor}. Per checks-and-balances, a <em>different</em> manager must confirm it.`,
    );
    await logAudit({ actorEmail: actor, action: "review", entity: "credential", entityId: id, detail: "approved" });
    back("/credentials", "Reviewed — awaiting a second confirmation");
  } else {
    await db
      .update(credentials)
      .set({
        status: "active",
        pendingPathname: null,
        pendingIssuedAt: null,
        pendingExpiresAt: null,
        pendingSubmittedAt: null,
        pendingSubmittedBy: null,
        reviewedBy: null,
        reviewedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(credentials.id, id));
    if (cred.pendingSubmittedBy) {
      await notifyEmail(
        cred.pendingSubmittedBy,
        "Certificate needs another look",
        `Your <strong>${credentialLabel(cred.type)}</strong> submission was returned by a manager${str(formData, "note") ? ` — “${str(formData, "note")}”` : ""}. Please re-upload a corrected certificate.`,
      );
    }
    await logAudit({ actorEmail: actor, action: "review", entity: "credential", entityId: id, detail: "rejected" });
    back("/credentials", "Returned to the employee");
  }
}

// ── Second manager: confirm (separation of duties) ──

export async function confirmRenewal(formData: FormData) {
  const actor = await requireManage();
  const id = str(formData, "credentialId");
  const decision = str(formData, "decision"); // confirm | reject
  if (!id) throw new Error("Missing credential.");
  const cred = await loadCred(id);
  if (cred.status !== "pending_confirm") throw new Error("This credential isn't awaiting confirmation.");
  if (cred.reviewedBy && actor && cred.reviewedBy.toLowerCase() === actor.toLowerCase()) {
    throw new Error("For checks-and-balances, the confirmation must be done by a different manager than the reviewer.");
  }

  if (decision === "confirm") {
    await db
      .update(credentials)
      .set({
        status: "active",
        issuedAt: cred.pendingIssuedAt ?? cred.issuedAt,
        expiresAt: cred.pendingExpiresAt ?? cred.expiresAt,
        certificatePathname: cred.pendingPathname ?? cred.certificatePathname,
        confirmedBy: actor,
        confirmedAt: new Date(),
        pendingPathname: null,
        pendingIssuedAt: null,
        pendingExpiresAt: null,
        pendingSubmittedAt: null,
        pendingSubmittedBy: null,
        lastRemindedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(credentials.id, id));
    if (cred.pendingSubmittedBy) {
      await notifyEmail(
        cred.pendingSubmittedBy,
        "Certificate confirmed",
        `Your <strong>${credentialLabel(cred.type)}</strong> renewal is confirmed and on file. Thank you!`,
      );
    }
    await logAudit({ actorEmail: actor, action: "confirm", entity: "credential", entityId: id });
    back("/credentials", "Confirmed — credential is up to date");
  } else {
    // Send back to first-review stage.
    await db
      .update(credentials)
      .set({ status: "pending_review", reviewedBy: null, reviewedAt: null, updatedAt: new Date() })
      .where(eq(credentials.id, id));
    if (cred.reviewedBy) {
      await notifyEmail(cred.reviewedBy, "Confirmation declined", `A confirmation was declined for a <strong>${credentialLabel(cred.type)}</strong> — please re-review.`);
    }
    await logAudit({ actorEmail: actor, action: "confirm", entity: "credential", entityId: id, detail: "declined" });
    back("/credentials", "Sent back for re-review");
  }
}
