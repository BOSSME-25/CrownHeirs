"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { complianceAttestations, complianceEvidence, complianceItems } from "@/lib/db/schema";
import { getAccess } from "@/lib/perms";
import { getDefaultOrg } from "@/lib/org";
import { logAudit } from "@/lib/audit";
import { putPrivate } from "@/lib/blobUpload";
import { isCadence, isLevel } from "@/lib/compliance-constants";
import { complianceState, listComplianceItems, todayYMD, type AttestationSnapshot } from "@/lib/compliance";

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};
const back = (msg: string) => redirect(`/admin/compliance?ok=${encodeURIComponent(msg)}`);

// Leadership only — directors & owners manage the compliance register.
async function requireLeadership() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canManageTeam) throw new Error("Only a director or owner can manage compliance.");
  return session?.user?.email ?? null;
}

export async function addComplianceItem(formData: FormData) {
  const actor = await requireLeadership();
  const title = str(formData, "title");
  const level = str(formData, "level") ?? "federal";
  if (!title) throw new Error("A title is required.");
  const cadence = str(formData, "cadence") ?? "annual";
  const org = await getDefaultOrg();
  await db.insert(complianceItems).values({
    orgId: org?.id ?? null,
    level: isLevel(level) ? level : "federal",
    title,
    description: str(formData, "description"),
    category: str(formData, "category"),
    cadence: isCadence(cadence) ? cadence : "annual",
    responsibleEmail: str(formData, "responsibleEmail"),
    dueAt: str(formData, "dueAt"),
    status: "attention",
  });
  await logAudit({ actorEmail: actor, action: "create", entity: "compliance_item", detail: title });
  revalidatePath("/admin/compliance");
  back(`Added “${title}”`);
}

export async function updateComplianceItem(formData: FormData) {
  const actor = await requireLeadership();
  const id = str(formData, "itemId");
  const title = str(formData, "title");
  if (!id || !title) throw new Error("Missing item or title.");
  const level = str(formData, "level") ?? "federal";
  const cadence = str(formData, "cadence") ?? "annual";
  await db
    .update(complianceItems)
    .set({
      level: isLevel(level) ? level : "federal",
      title,
      description: str(formData, "description"),
      category: str(formData, "category"),
      cadence: isCadence(cadence) ? cadence : "annual",
      responsibleEmail: str(formData, "responsibleEmail"),
      dueAt: str(formData, "dueAt"),
      updatedAt: new Date(),
    })
    .where(eq(complianceItems.id, id));
  await logAudit({ actorEmail: actor, action: "update", entity: "compliance_item", entityId: id, detail: title });
  revalidatePath("/admin/compliance");
  back("Item updated");
}

// Manager records the current status (and marks it reviewed).
export async function setComplianceStatus(formData: FormData) {
  const actor = await requireLeadership();
  const id = str(formData, "itemId");
  const status = str(formData, "status");
  if (!id || !status || !["compliant", "attention", "na"].includes(status)) throw new Error("Pick a status.");
  await db
    .update(complianceItems)
    .set({ status, lastReviewedAt: new Date(), needsVerification: false, lastRemindedAt: null, updatedAt: new Date() })
    .where(eq(complianceItems.id, id));
  await logAudit({ actorEmail: actor, action: "review", entity: "compliance_item", entityId: id, detail: status });
  revalidatePath("/admin/compliance");
  back("Status recorded");
}

export async function deleteComplianceItem(formData: FormData) {
  const actor = await requireLeadership();
  const id = str(formData, "itemId");
  if (!id) throw new Error("Missing item.");
  await db.delete(complianceItems).where(eq(complianceItems.id, id));
  await logAudit({ actorEmail: actor, action: "delete", entity: "compliance_item", entityId: id });
  revalidatePath("/admin/compliance");
  back("Item removed");
}

// ── Evidence ──
export async function addEvidence(formData: FormData) {
  const actor = await requireLeadership();
  const itemId = str(formData, "itemId");
  if (!itemId) throw new Error("Missing item.");
  const org = await getDefaultOrg();
  const label = str(formData, "label");
  const link = str(formData, "link");
  const file = formData.get("file");

  let kind = "note";
  let url: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > 8 * 1024 * 1024) throw new Error("File too large (max 8 MB).");
    url = await putPrivate("compliance", file);
    kind = "file";
  } else if (link) {
    url = link;
    kind = "link";
  }
  if (!label && !url) throw new Error("Add a note, a link, or a file.");

  await db.insert(complianceEvidence).values({
    orgId: org?.id ?? null,
    itemId,
    kind,
    label: label ?? (kind === "file" ? "Uploaded file" : kind === "link" ? "Link" : null),
    url,
    addedBy: actor,
  });
  await logAudit({ actorEmail: actor, action: "create", entity: "compliance_evidence", entityId: itemId });
  revalidatePath("/admin/compliance");
  back("Evidence added");
}

export async function removeEvidence(formData: FormData) {
  const actor = await requireLeadership();
  const id = str(formData, "evidenceId");
  if (!id) throw new Error("Missing evidence.");
  await db.delete(complianceEvidence).where(eq(complianceEvidence.id, id));
  await logAudit({ actorEmail: actor, action: "delete", entity: "compliance_evidence", entityId: id });
  revalidatePath("/admin/compliance");
  back("Evidence removed");
}

// ── Attestations (two-person sign-off) ──

// A director/owner attests that the register is accurate right now; this
// snapshots the whole register and awaits a second person's confirmation.
export async function attestCompliance(formData: FormData) {
  const actor = await requireLeadership();
  const items = await listComplianceItems();
  const today = todayYMD();
  const snapItems = items.map((i) => {
    const s = complianceState({ status: i.status, dueAt: i.dueAt }, today);
    return { id: i.id, title: i.title, level: i.level, status: i.status, dueAt: i.dueAt, key: s.key, label: s.label };
  });
  const counts = { total: snapItems.length, compliant: 0, attention: 0, overdue: 0, due: 0, na: 0 };
  for (const si of snapItems) {
    if (si.key in counts) (counts as Record<string, number>)[si.key] += 1;
  }
  const snapshot: AttestationSnapshot = { counts, items: snapItems };
  const org = await getDefaultOrg();
  await db.insert(complianceAttestations).values({
    orgId: org?.id ?? null,
    periodLabel: str(formData, "periodLabel"),
    attestedBy: actor,
    attestedAt: new Date(),
    note: str(formData, "note"),
    snapshot,
  });
  await logAudit({ actorEmail: actor, action: "attest", entity: "compliance", detail: `${counts.total} items` });
  revalidatePath("/admin/compliance");
  back("Attested — a different director/owner must now confirm");
}

// A different director/owner confirms (or sends back for re-attestation).
export async function decideAttestation(formData: FormData) {
  const actor = await requireLeadership();
  const id = str(formData, "attestationId");
  const decision = str(formData, "decision"); // confirm | reject
  if (!id) throw new Error("Missing attestation.");
  const row = (await db.select().from(complianceAttestations).where(eq(complianceAttestations.id, id)))[0];
  if (!row || !row.attestedAt || row.confirmedAt) throw new Error("This attestation isn’t awaiting confirmation.");
  if (row.attestedBy && actor && row.attestedBy.toLowerCase() === actor.toLowerCase()) {
    throw new Error("For checks and balances, a different person must confirm the attestation.");
  }
  if (decision === "confirm") {
    await db.update(complianceAttestations).set({ confirmedBy: actor, confirmedAt: new Date() }).where(eq(complianceAttestations.id, id));
    await logAudit({ actorEmail: actor, action: "confirm", entity: "compliance", entityId: id });
    back("Attestation confirmed");
  } else {
    await db.delete(complianceAttestations).where(eq(complianceAttestations.id, id));
    await logAudit({ actorEmail: actor, action: "reject", entity: "compliance", entityId: id, detail: "attestation returned" });
    back("Sent back — the register can be corrected and re-attested");
  }
}
