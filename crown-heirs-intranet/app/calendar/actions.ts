"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { getAccess } from "@/lib/perms";
import { db } from "@/lib/db";
import { meetingRequests, meetings } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";
import { getDefaultOrg } from "@/lib/org";
import { managementEmails } from "@/lib/meetingRequests";
import { adminEmails, emailLayout, sendEmail } from "@/lib/email";

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

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};

// A stylist requests a 1:1 or meeting; management is emailed and can schedule it.
export async function requestMeeting(formData: FormData) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Not signed in.");
  const me = await getEmployeeByEmail(email);
  if (!me) throw new Error("You’re not on the team roster yet.");

  const kind = str(formData, "kind") === "meeting" ? "meeting" : "one_on_one";
  const preferredDate = str(formData, "preferredDate");
  const preferredTime = str(formData, "preferredTime");
  const note = str(formData, "note");
  const org = await getDefaultOrg();

  await db.insert(meetingRequests).values({
    orgId: org?.id ?? null,
    requesterId: me.id,
    requesterName: me.fullName,
    requesterEmail: email,
    kind,
    preferredDate,
    preferredTime,
    note,
  });

  try {
    const kindLabel = kind === "meeting" ? "a meeting" : "a 1:1";
    const when = preferredDate ? ` Preferred: ${preferredDate}${preferredTime ? ` at ${preferredTime}` : ""}.` : "";
    const to = await managementEmails();
    await sendEmail({
      to: to.length ? to : adminEmails(),
      subject: `Meeting request — ${me.fullName}`,
      html: emailLayout(
        "New meeting request",
        `<strong>${me.fullName}</strong> requested ${kindLabel}.${when}${note ? `<p><em>Note:</em> ${note}</p>` : ""}<p>Schedule or decline it on the Calendar page.</p>`,
        "/calendar",
      ),
    });
  } catch {
    // best-effort
  }
  revalidatePath("/calendar");
  redirect(`/calendar?ok=${encodeURIComponent("Request sent — management will follow up")}`);
}

// Management marks a request scheduled or declined and the requester is emailed.
export async function decideMeetingRequest(formData: FormData) {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canApprove) throw new Error("Only management can handle requests.");
  const id = str(formData, "requestId");
  const decision = str(formData, "decision") === "scheduled" ? "scheduled" : "declined";
  if (!id) throw new Error("Missing request.");

  const req = (await db.select().from(meetingRequests).where(eq(meetingRequests.id, id)))[0];
  if (!req) throw new Error("Request not found.");
  await db.update(meetingRequests).set({ status: decision }).where(eq(meetingRequests.id, id));

  if (req.requesterEmail) {
    try {
      await sendEmail({
        to: req.requesterEmail,
        subject: decision === "scheduled" ? "Your meeting request — scheduled" : "Your meeting request",
        html: emailLayout(
          decision === "scheduled" ? "Meeting scheduled" : "Meeting request update",
          decision === "scheduled"
            ? "Your meeting request was scheduled — check the Calendar for details."
            : "Your meeting request was reviewed. Reach out to management if you’d like to find another time.",
          "/calendar",
        ),
      });
    } catch {
      // best-effort
    }
  }
  revalidatePath("/calendar");
  redirect(`/calendar?ok=${encodeURIComponent(decision === "scheduled" ? "Marked scheduled" : "Request declined")}`);
}
