"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { db } from "@/lib/db";
import { meetings } from "@/lib/db/schema";

export async function addMeeting(formData: FormData) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) throw new Error("Only admins can add meetings.");

  const get = (k: string) => {
    const v = formData.get(k);
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? null : s;
  };
  const title = get("title");
  const meetingDate = get("meetingDate");
  if (!title || !meetingDate) throw new Error("Title and date are required.");

  await db.insert(meetings).values({
    title,
    meetingDate,
    startTime: get("startTime"),
    location: get("location"),
    meetingUrl: get("meetingUrl"),
    notes: get("notes"),
  });
  revalidatePath("/calendar");
  revalidatePath("/");
  redirect(`/calendar?ok=${encodeURIComponent("Meeting added")}`);
}

export async function deleteMeeting(id: string) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) throw new Error("Only admins can remove meetings.");
  await db.delete(meetings).where(eq(meetings.id, id));
  revalidatePath("/calendar");
  revalidatePath("/");
  redirect(`/calendar?ok=${encodeURIComponent("Meeting removed")}`);
}
