"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import { db } from "@/lib/db";
import { reviews } from "@/lib/db/schema";
import { getDefaultOrg } from "@/lib/org";
import { logAudit } from "@/lib/audit";

async function requireManage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canManageTeam) throw new Error("Only managers and above can write reviews.");
  return session?.user?.email ?? null;
}

export async function createReview(formData: FormData) {
  const actor = await requireManage();
  const org = await getDefaultOrg();
  const get = (k: string) => {
    const v = formData.get(k);
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? null : s;
  };
  const employeeId = get("employeeId");
  if (!employeeId) throw new Error("Choose a team member.");
  const ratingRaw = get("rating");
  const share = formData.get("share") === "on";

  await db.insert(reviews).values({
    orgId: org?.id ?? null,
    employeeId,
    reviewerEmail: actor,
    periodLabel: get("periodLabel"),
    reviewDate: get("reviewDate"),
    rating: ratingRaw ? Number(ratingRaw) : null,
    strengths: get("strengths"),
    growth: get("growth"),
    goals: get("goals"),
    status: share ? "shared" : "draft",
  });
  await logAudit({ actorEmail: actor, action: "create", entity: "review", detail: get("periodLabel") ?? "" });
  revalidatePath("/reviews");
  redirect(`/reviews?ok=${encodeURIComponent(share ? "Review saved & shared" : "Review saved as draft")}`);
}

export async function shareReview(id: string) {
  await requireManage();
  await db.update(reviews).set({ status: "shared", updatedAt: new Date() }).where(eq(reviews.id, id));
  revalidatePath("/reviews");
  redirect(`/reviews?ok=${encodeURIComponent("Review shared with employee")}`);
}

export async function deleteReview(id: string) {
  await requireManage();
  await db.delete(reviews).where(eq(reviews.id, id));
  revalidatePath("/reviews");
  redirect(`/reviews?ok=${encodeURIComponent("Review deleted")}`);
}
