import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { policyAcks } from "@/lib/db/schema";
import { adminEmails, emailLayout, sendEmail } from "@/lib/email";
import { ackState, ensurePolicyAssignments, listAssignments } from "@/lib/policies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Don't re-nudge the same sign-off more than once a week.
const THROTTLE_MS = 7 * 24 * 60 * 60 * 1000;

// Reminds employees about documents they still need to sign, and nudges
// managers about sign-offs waiting to be confirmed. Vercel Cron (see vercel.json).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let rows;
  try {
    await ensurePolicyAssignments();
    rows = await listAssignments();
  } catch {
    return new Response("Policies not set up", { status: 200 });
  }

  const now = Date.now();
  const dueForReminder = (lastRemindedAt: Date | null) =>
    !lastRemindedAt || now - new Date(lastRemindedAt).getTime() >= THROTTLE_MS;

  // Employee-facing, grouped per person.
  const employeeItems = new Map<string, { name: string; titles: string[] }>();
  // Manager-facing confirmation queue.
  const managerItems: { name: string; title: string }[] = [];
  const remindedIds: string[] = [];

  for (const r of rows) {
    const s = ackState(r.ack, r.policy.version);
    if (s.complete) continue;
    if (!dueForReminder(r.ack.lastRemindedAt)) continue;

    if (s.needsEmployee) {
      if (r.employeeEmail) {
        if (!employeeItems.has(r.employeeEmail)) employeeItems.set(r.employeeEmail, { name: r.employeeName, titles: [] });
        employeeItems.get(r.employeeEmail)!.titles.push(r.policy.title);
        remindedIds.push(r.ack.id);
      }
    } else if (s.needsManager) {
      managerItems.push({ name: r.employeeName, title: r.policy.title });
      remindedIds.push(r.ack.id);
    }
  }

  let sent = 0;

  for (const [empEmail, { name, titles }] of employeeItems) {
    const list = titles.map((t) => `<li><strong>${t}</strong></li>`).join("");
    const body =
      `Hi ${name.split(" ")[0]}, please read and sign the following ${titles.length === 1 ? "document" : "documents"} on the Acknowledgments page. ` +
      `A manager will confirm your sign-off.<ul>${list}</ul>`;
    try {
      await sendEmail({
        to: [empEmail, ...adminEmails()],
        subject: `Please sign: ${titles.length === 1 ? titles[0] : `${titles.length} documents`}`,
        html: emailLayout("Documents to sign", body, "/acknowledgments"),
      });
      sent++;
    } catch {
      // best-effort
    }
  }

  if (managerItems.length) {
    const list = managerItems.map((i) => `<li><strong>${i.name}</strong> — ${i.title}</li>`).join("");
    const body = `These sign-offs are signed and waiting for a manager to confirm them on the Acknowledgments page.<ul>${list}</ul>`;
    try {
      await sendEmail({
        to: adminEmails(),
        subject: "Sign-offs awaiting confirmation",
        html: emailLayout("Acknowledgments queue", body, "/acknowledgments"),
      });
      sent++;
    } catch {
      // best-effort
    }
  }

  if (remindedIds.length) {
    const ts = new Date();
    for (const id of remindedIds) {
      await db.update(policyAcks).set({ lastRemindedAt: ts }).where(eq(policyAcks.id, id));
    }
  }

  return new Response(`Sent ${sent} reminder email(s)`, { status: 200 });
}
