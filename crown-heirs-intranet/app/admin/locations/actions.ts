"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import { db } from "@/lib/db";
import { locations } from "@/lib/db/schema";
import { getDefaultOrg } from "@/lib/org";

async function requireSystem() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canSystem) throw new Error("Only the CEO/COO can manage locations.");
}

export async function addLocation(formData: FormData) {
  await requireSystem();
  const org = await getDefaultOrg();
  if (!org) throw new Error("Run database setup first.");

  const get = (k: string) => {
    const v = formData.get(k);
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? null : s;
  };
  const name = get("name");
  if (!name) throw new Error("Location name is required.");

  await db.insert(locations).values({
    orgId: org.id,
    name,
    squareLocationId: get("squareLocationId"),
    timezone: get("timezone") ?? "America/Phoenix",
    address: get("address"),
  });
  revalidatePath("/admin/locations");
  redirect(`/admin/locations?ok=${encodeURIComponent("Location added")}`);
}

export async function updateLocation(id: string, formData: FormData) {
  await requireSystem();
  const get = (k: string) => {
    const v = formData.get(k);
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? null : s;
  };
  await db
    .update(locations)
    .set({
      name: get("name") ?? "Location",
      squareLocationId: get("squareLocationId"),
      timezone: get("timezone") ?? "America/Phoenix",
      address: get("address"),
      active: formData.get("active") === "on",
    })
    .where(eq(locations.id, id));
  revalidatePath("/admin/locations");
  redirect(`/admin/locations?ok=${encodeURIComponent("Location updated")}`);
}
