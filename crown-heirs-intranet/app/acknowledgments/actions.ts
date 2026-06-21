"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import { db } from "@/lib/db";
import { policies, policyAcks } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";
import { getDefaultOrg } from "@/lib/org";
import { logAudit } from "@/lib/audit";

async function requireSystem() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canSystem) throw new Error("Only the CEO/COO can manage policies.");
}

export async function acknowledgePolicy(policyId: string) {
  const session = await auth();
  const me = await getEmployeeByEmail(session?.user?.email ?? "");
  if (!me) throw new Error("You’re not on the team roster yet.");
  await db.insert(policyAcks).values({ policyId, employeeId: me.id }).onConflictDoNothing();
  await logAudit({ actorEmail: session?.user?.email, action: "acknowledge", entity: "policy", entityId: policyId });
  revalidatePath("/acknowledgments");
  redirect(`/acknowledgments?ok=${encodeURIComponent("Acknowledged — thank you")}`);
}

export async function addPolicy(formData: FormData) {
  await requireSystem();
  const org = await getDefaultOrg();
  const get = (k: string) => {
    const v = formData.get(k);
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? null : s;
  };
  const title = get("title");
  if (!title) throw new Error("Title is required.");
  await db.insert(policies).values({
    orgId: org?.id ?? null,
    title,
    body: get("body"),
    fileUrl: get("fileUrl"),
  });
  revalidatePath("/acknowledgments");
  redirect(`/acknowledgments?ok=${encodeURIComponent("Policy added")}`);
}

export async function deactivatePolicy(id: string) {
  await requireSystem();
  await db.update(policies).set({ active: false }).where(eq(policies.id, id));
  revalidatePath("/acknowledgments");
  redirect(`/acknowledgments?ok=${encodeURIComponent("Policy archived")}`);
}
