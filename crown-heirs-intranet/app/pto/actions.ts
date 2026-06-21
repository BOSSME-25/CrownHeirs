"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import { db } from "@/lib/db";
import { ptoLedger } from "@/lib/db/schema";
import { getDefaultOrg } from "@/lib/org";
import { logAudit } from "@/lib/audit";

async function requireManage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canManageTeam) throw new Error("Only managers and above can adjust PTO.");
  return session?.user?.email ?? null;
}

export async function addPtoEntry(formData: FormData) {
  const actor = await requireManage();
  const org = await getDefaultOrg();
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const employeeId = get("employeeId");
  const hours = Number(get("hours"));
  if (!employeeId) throw new Error("Choose a team member.");
  if (!Number.isFinite(hours) || hours === 0) throw new Error("Enter a non-zero number of hours (use a minus sign to deduct).");
  const kind = ["grant", "accrual", "usage", "adjustment"].includes(get("kind")) ? get("kind") : "adjustment";

  await db.insert(ptoLedger).values({
    orgId: org?.id ?? null,
    employeeId,
    hours: String(hours),
    kind,
    note: get("note") || null,
    effectiveDate: get("effectiveDate") || null,
    createdBy: actor,
  });
  await logAudit({ actorEmail: actor, action: "adjust", entity: "pto", detail: `${hours > 0 ? "+" : ""}${hours}h (${kind})` });
  revalidatePath("/pto");
  redirect(`/pto?ok=${encodeURIComponent("PTO updated")}`);
}

export async function deletePtoEntry(id: string) {
  const actor = await requireManage();
  await db.delete(ptoLedger).where(eq(ptoLedger.id, id));
  await logAudit({ actorEmail: actor, action: "delete", entity: "pto", entityId: id });
  revalidatePath("/pto");
  redirect(`/pto?ok=${encodeURIComponent("Entry removed")}`);
}
