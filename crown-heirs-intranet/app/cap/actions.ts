"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { capActions, capFlags, capPoints, employees } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";
import { getDefaultOrg } from "@/lib/org";
import { getAccess } from "@/lib/perms";
import { logAudit } from "@/lib/audit";
import { adminEmails, emailLayout, sendEmail } from "@/lib/email";
import { canApproveProposal, CAP_LEVELS, DISPUTE_DAYS, infractionById, infractionLabel, CAP_WINDOW_DAYS } from "@/lib/cap-constants";
import { balanceForEmployee, getCapAction, getPoint } from "@/lib/cap";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};
const back = (to: string, msg: string) => redirect(`${to}?ok=${encodeURIComponent(msg)}`);

async function actor() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Not signed in.");
  const emp = await getEmployeeByEmail(email);
  const access = await getAccess(email);
  return { email, emp, access };
}

async function notify(to: string | string[], subject: string, body: string, cta = "/cap") {
  try {
    if (Array.isArray(to) && to.length === 0) return;
    await sendEmail({ to, subject, html: emailLayout(subject, body, cta) });
  } catch {
    /* best-effort */
  }
}

// Directors + owners (who can approve a manager's proposal / resolve disputes).
async function leadershipEmails(): Promise<string[]> {
  const rows = await db.select({ email: employees.email, role: employees.role, status: employees.status }).from(employees);
  const dirs = rows.filter((r) => r.status === "active" && (r.role === "director" || r.role === "admin")).map((r) => r.email).filter(Boolean) as string[];
  return [...new Set([...adminEmails(), ...dirs])];
}
async function managerEmails(): Promise<string[]> {
  const rows = await db.select({ email: employees.email, role: employees.role, status: employees.status }).from(employees);
  const m = rows.filter((r) => r.status === "active" && ["manager", "director", "admin"].includes(r.role)).map((r) => r.email).filter(Boolean) as string[];
  return [...new Set([...adminEmails(), ...m])];
}

// ── Any employee: raise a flag (observation) to management ──
export async function raiseFlag(formData: FormData) {
  const { email, emp } = await actor();
  if (!emp) throw new Error("You’re not on the team roster yet.");
  const subjectEmployeeId = str(formData, "subjectEmployeeId");
  const note = str(formData, "note");
  if (!subjectEmployeeId) throw new Error("Choose who this is about.");
  if (!note) throw new Error("Add a short note about what you observed.");
  const org = await getDefaultOrg();
  await db.insert(capFlags).values({
    orgId: org?.id ?? null,
    subjectEmployeeId,
    reporterEmail: email,
    infractionType: str(formData, "infractionType"),
    note,
  });
  const subj = (await db.select({ name: employees.fullName }).from(employees).where(eq(employees.id, subjectEmployeeId)))[0];
  await notify(await managerEmails(), "New CAP flag to review", `A team member raised an observation about <strong>${subj?.name ?? "a teammate"}</strong> for a manager to review. No points are applied until a manager proposes and a leader approves.`);
  await logAudit({ actorEmail: email, action: "flag", entity: "cap", detail: subj?.name ?? "" });
  revalidatePath("/cap");
  back("/cap", "Sent to management — thank you");
}

export async function dismissFlag(formData: FormData) {
  const { email, access } = await actor();
  if (!access.canApprove) throw new Error("Only managers can dismiss flags.");
  const id = str(formData, "flagId");
  if (!id) throw new Error("Missing flag.");
  await db.update(capFlags).set({ status: "dismissed" }).where(eq(capFlags.id, id));
  await logAudit({ actorEmail: email, action: "dismiss", entity: "cap_flag", entityId: id });
  revalidatePath("/cap");
  back("/cap", "Flag dismissed");
}

// ── Manager: propose a point (awaits approval from the next level up) ──
export async function proposePoint(formData: FormData) {
  const { email, access } = await actor();
  if (!access.canApprove) throw new Error("Only managers and above can propose points.");
  const employeeId = str(formData, "employeeId");
  const infractionType = str(formData, "infractionType");
  if (!employeeId || !infractionType) throw new Error("Pick a team member and an infraction.");
  const inf = infractionById(infractionType);
  if (!inf) throw new Error("Unknown infraction.");
  const org = await getDefaultOrg();

  const [row] = await db
    .insert(capPoints)
    .values({
      orgId: org?.id ?? null,
      employeeId,
      infractionType,
      points: String(inf.points),
      note: str(formData, "note"),
      issuedBy: email,
      status: "proposed",
      sourceFlagId: str(formData, "sourceFlagId"),
    })
    .returning();

  const flagId = str(formData, "sourceFlagId");
  if (flagId) await db.update(capFlags).set({ status: "actioned" }).where(eq(capFlags.id, flagId));

  const subj = (await db.select({ name: employees.fullName }).from(employees).where(eq(employees.id, employeeId)))[0];
  await notify(
    await leadershipEmails(),
    "CAP point needs your approval",
    `${email} proposed <strong>${inf.points} point(s)</strong> (${inf.label}) for <strong>${subj?.name ?? "a team member"}</strong>. It is not visible to the employee until a leader one level up approves it on the Corrective Action page.`,
  );
  await logAudit({ actorEmail: email, action: "propose", entity: "cap_point", entityId: row?.id, detail: `${inf.points} — ${inf.label}` });
  revalidatePath("/cap");
  back("/cap", "Proposed — awaiting approval from the next level up");
}

// ── Next level up: approve or reject a proposed point ──
export async function decidePoint(formData: FormData) {
  const { email, access } = await actor();
  const id = str(formData, "pointId");
  const decision = str(formData, "decision"); // approve | reject
  if (!id) throw new Error("Missing point.");
  const p = await getPoint(id);
  if (!p || p.status !== "proposed") throw new Error("This point isn’t awaiting approval.");

  const issuerAccess = await getAccess(p.issuedBy);
  if (!canApproveProposal(issuerAccess.level, access.level, !!p.issuedBy && p.issuedBy.toLowerCase() === email.toLowerCase())) {
    throw new Error("This must be approved by a leader one level above the manager who proposed it.");
  }

  const subj = (await db.select({ email: employees.email, name: employees.fullName }).from(employees).where(eq(employees.id, p.employeeId)))[0];
  if (decision === "approve") {
    const now = new Date();
    const exp = new Date(now);
    exp.setDate(exp.getDate() + CAP_WINDOW_DAYS);
    await db
      .update(capPoints)
      .set({ status: "active", approvedBy: email, approvedAt: now, activeAt: now, expiresAt: exp.toISOString().slice(0, 10), updatedAt: now })
      .where(eq(capPoints.id, id));
    if (subj?.email) {
      await notify(subj.email, "A point was added to your CAP record", `A point was recorded for <strong>${infractionLabel(p.infractionType ?? "")}</strong>. See your standing under Discipline &amp; Advancement. If you believe this is in error, you can dispute it within ${DISPUTE_DAYS} days.`, "/discipline");
    }
    await logAudit({ actorEmail: email, action: "approve", entity: "cap_point", entityId: id });
    back("/cap", "Approved — recorded and the employee notified");
  } else {
    await db.update(capPoints).set({ status: "rejected", approvedBy: email, approvedAt: new Date(), updatedAt: new Date() }).where(eq(capPoints.id, id));
    await logAudit({ actorEmail: email, action: "reject", entity: "cap_point", entityId: id });
    back("/cap", "Rejected — nothing recorded for the employee");
  }
}

// ── Employee: dispute an active point within the window ──
export async function disputePoint(formData: FormData) {
  const { email, emp } = await actor();
  if (!emp) throw new Error("You’re not on the team roster yet.");
  const id = str(formData, "pointId");
  const note = str(formData, "note");
  if (!id) throw new Error("Missing point.");
  const p = await getPoint(id);
  if (!p || p.employeeId !== emp.id) throw new Error("That isn’t your record.");
  if (p.status !== "active") throw new Error("Only an active point can be disputed.");
  if (p.activeAt) {
    const days = (Date.now() - new Date(p.activeAt).getTime()) / 86400000;
    if (days > DISPUTE_DAYS) throw new Error(`The ${DISPUTE_DAYS}-day dispute window has passed. Raise it in your 1:1.`);
  }
  await db.update(capPoints).set({ status: "disputed", disputeNote: note, disputedAt: new Date(), updatedAt: new Date() }).where(eq(capPoints.id, id));
  await notify(await leadershipEmails(), "CAP point disputed", `${emp.fullName} disputed a point (${infractionLabel(p.infractionType ?? "")}). Review it on the Corrective Action page.`);
  await logAudit({ actorEmail: email, action: "dispute", entity: "cap_point", entityId: id });
  revalidatePath("/discipline");
  back("/discipline", "Dispute sent to leadership");
}

// ── Leadership: resolve a dispute, or remove/correct a point ──
export async function resolveDispute(formData: FormData) {
  const { email, access } = await actor();
  if (!access.canManageTeam) throw new Error("Only a director or owner can resolve disputes.");
  const id = str(formData, "pointId");
  const decision = str(formData, "decision"); // uphold | remove
  if (!id) throw new Error("Missing point.");
  const p = await getPoint(id);
  if (!p || p.status !== "disputed") throw new Error("That isn’t an open dispute.");
  const subj = (await db.select({ email: employees.email }).from(employees).where(eq(employees.id, p.employeeId)))[0];
  if (decision === "remove") {
    await db.update(capPoints).set({ status: "removed", disputeResolution: "removed", disputeResolvedBy: email, updatedAt: new Date() }).where(eq(capPoints.id, id));
    if (subj?.email) await notify(subj.email, "Your disputed point was removed", "After review, the point was removed from your record.", "/discipline");
  } else {
    await db.update(capPoints).set({ status: "active", disputeResolution: "upheld", disputeResolvedBy: email, updatedAt: new Date() }).where(eq(capPoints.id, id));
    if (subj?.email) await notify(subj.email, "Your dispute was reviewed", "After review, the point stands. Reach out to leadership if you have questions.", "/discipline");
  }
  await logAudit({ actorEmail: email, action: "resolve", entity: "cap_point", entityId: id, detail: decision ?? "" });
  revalidatePath("/cap");
  back("/cap", decision === "remove" ? "Point removed" : "Point upheld");
}

// ── Level corrective actions (phase 4) ──

// Manager documents the response when a threshold is reached; the employee
// then acknowledges and a second leader confirms.
export async function createCapAction(formData: FormData) {
  const { email, access } = await actor();
  if (!access.canApprove) throw new Error("Only managers and above can start a corrective action.");
  const employeeId = str(formData, "employeeId");
  const levelKey = str(formData, "levelKey");
  const plan = str(formData, "plan");
  if (!employeeId || !levelKey || !CAP_LEVELS.some((l) => l.key === levelKey)) throw new Error("Pick a team member and a level.");
  const balance = await balanceForEmployee(employeeId);
  const org = await getDefaultOrg();
  await db.insert(capActions).values({
    orgId: org?.id ?? null,
    employeeId,
    levelKey,
    balanceAt: String(balance),
    plan,
    createdBy: email,
    status: "pending_ack",
  });
  const subj = (await db.select({ email: employees.email, name: employees.fullName }).from(employees).where(eq(employees.id, employeeId)))[0];
  const label = CAP_LEVELS.find((l) => l.key === levelKey)?.label ?? levelKey;
  if (subj?.email) await notify(subj.email, `Corrective action to review — ${label}`, `Leadership documented a <strong>${label}</strong> corrective action. Please review and acknowledge it under Discipline &amp; Advancement.`, "/discipline");
  await logAudit({ actorEmail: email, action: "create", entity: "cap_action", detail: `${label} — ${subj?.name ?? ""}` });
  revalidatePath("/cap");
  revalidatePath("/discipline");
  back("/cap", "Corrective action started — awaiting the employee’s acknowledgment");
}

// Employee acknowledges their own corrective action.
export async function acknowledgeCapAction(formData: FormData) {
  const { email, emp } = await actor();
  if (!emp) throw new Error("You’re not on the team roster yet.");
  const id = str(formData, "actionId");
  if (!id) throw new Error("Missing action.");
  const a = await getCapAction(id);
  if (!a || a.employeeId !== emp.id) throw new Error("That isn’t your record.");
  if (a.status !== "pending_ack") throw new Error("This isn’t awaiting your acknowledgment.");
  await db.update(capActions).set({ acknowledgedAt: new Date(), status: "pending_confirm" }).where(eq(capActions.id, id));
  await notify(await leadershipEmails(), "Corrective action acknowledged", `${emp.fullName} acknowledged their corrective action. A second leader now confirms it on the Corrective Action page.`);
  await logAudit({ actorEmail: email, action: "acknowledge", entity: "cap_action", entityId: id });
  revalidatePath("/discipline");
  revalidatePath("/cap");
  back("/discipline", "Acknowledged — thank you");
}

// A different leader confirms (checks & balances) or voids the action.
export async function confirmCapAction(formData: FormData) {
  const { email, access } = await actor();
  if (!access.canManageTeam) throw new Error("Only a director or owner can confirm a corrective action.");
  const id = str(formData, "actionId");
  const decision = str(formData, "decision"); // confirm | void
  if (!id) throw new Error("Missing action.");
  const a = await getCapAction(id);
  if (!a || a.status !== "pending_confirm") throw new Error("This isn’t awaiting confirmation.");
  if (a.createdBy && a.createdBy.toLowerCase() === email.toLowerCase()) {
    throw new Error("For checks and balances, a different leader must confirm the corrective action.");
  }
  if (decision === "confirm") {
    await db.update(capActions).set({ confirmedBy: email, confirmedAt: new Date(), status: "confirmed" }).where(eq(capActions.id, id));
    const subj = (await db.select({ email: employees.email }).from(employees).where(eq(employees.id, a.employeeId)))[0];
    if (subj?.email) await notify(subj.email, "Corrective action confirmed", "Your corrective action has been confirmed and is on file. Leadership is here to support your path forward.", "/discipline");
    await logAudit({ actorEmail: email, action: "confirm", entity: "cap_action", entityId: id });
    back("/cap", "Confirmed and on file");
  } else {
    await db.update(capActions).set({ status: "void" }).where(eq(capActions.id, id));
    await logAudit({ actorEmail: email, action: "void", entity: "cap_action", entityId: id });
    back("/cap", "Corrective action voided");
  }
}

// ── Leadership: set a team member's advancement tier ──
export async function setTier(formData: FormData) {
  const { email, access } = await actor();
  if (!access.canManageTeam) throw new Error("Only a director or owner can set tiers.");
  const employeeId = str(formData, "employeeId");
  if (!employeeId) throw new Error("Missing team member.");
  await db.update(employees).set({ tier: str(formData, "tier"), updatedAt: new Date() }).where(eq(employees.id, employeeId));
  await logAudit({ actorEmail: email, action: "update", entity: "employee_tier", entityId: employeeId, detail: str(formData, "tier") ?? "" });
  revalidatePath("/cap");
  revalidatePath("/discipline");
  back("/cap", "Tier updated");
}

export async function removePoint(formData: FormData) {
  const { email, access } = await actor();
  if (!access.canManageTeam) throw new Error("Only a director or owner can remove a point.");
  const id = str(formData, "pointId");
  if (!id) throw new Error("Missing point.");
  await db.update(capPoints).set({ status: "removed", disputeResolution: "corrected", disputeResolvedBy: email, updatedAt: new Date() }).where(eq(capPoints.id, id));
  await logAudit({ actorEmail: email, action: "remove", entity: "cap_point", entityId: id });
  revalidatePath("/cap");
  back("/cap", "Point removed");
}
