import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { credentials } from "@/lib/db/schema";
import { adminEmails, emailLayout, sendEmail } from "@/lib/email";
import {
  credentialLabel,
  credentialState,
  listAllCredentials,
  prettyDate,
} from "@/lib/credentials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Don't re-nudge the same credential more than once a week.
const THROTTLE_MS = 7 * 24 * 60 * 60 * 1000;

// Reminds employees (and management) about licenses/certs that are within 90
// days of expiring, expired, or missing — and nudges managers about uploaded
// certificates waiting for review or confirmation. Vercel Cron (see vercel.json).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let rows;
  try {
    rows = await listAllCredentials();
  } catch {
    return new Response("Credentials not set up", { status: 200 });
  }

  const now = Date.now();
  const dueForReminder = (lastRemindedAt: Date | null) =>
    !lastRemindedAt || now - new Date(lastRemindedAt).getTime() >= THROTTLE_MS;

  // Employee-facing reminders, grouped per person.
  const employeeItems = new Map<string, { name: string; items: { label: string; stateLabel: string; expiresAt: string | null }[] }>();
  // Manager-facing queue (uploads waiting on a review / confirmation).
  const managerItems: { name: string; label: string; stateLabel: string }[] = [];
  const remindedIds: string[] = [];

  for (const r of rows) {
    const s = credentialState({ status: r.c.status, expiresAt: r.c.expiresAt });
    if (!s.urgent) continue;
    if (!dueForReminder(r.c.lastRemindedAt)) continue;

    if (s.key === "review" || s.key === "confirm") {
      managerItems.push({ name: r.employeeName, label: credentialLabel(r.c.type), stateLabel: s.label });
      remindedIds.push(r.c.id);
    } else if (r.employeeEmail) {
      // missing / due / expired — the employee needs to renew & upload.
      if (!employeeItems.has(r.employeeEmail)) {
        employeeItems.set(r.employeeEmail, { name: r.employeeName, items: [] });
      }
      employeeItems.get(r.employeeEmail)!.items.push({
        label: credentialLabel(r.c.type),
        stateLabel: s.label,
        expiresAt: r.c.expiresAt,
      });
      remindedIds.push(r.c.id);
    }
  }

  let sent = 0;

  for (const [empEmail, { name, items }] of employeeItems) {
    const list = items
      .map((i) => `<li><strong>${i.label}</strong> — ${i.stateLabel}${i.expiresAt ? ` (expires ${prettyDate(i.expiresAt)})` : ""}</li>`)
      .join("");
    const body =
      `Hi ${name.split(" ")[0]}, the following ${items.length === 1 ? "credential needs" : "credentials need"} your attention. ` +
      `Please upload your renewed certificate on your profile — a manager will review it and a second manager will confirm it.` +
      `<ul>${list}</ul>`;
    try {
      await sendEmail({
        to: [empEmail, ...adminEmails()],
        subject: `Action needed: licensing & certifications — ${name}`,
        html: emailLayout("Licensing & certifications", body, "/me"),
      });
      sent++;
    } catch {
      // best-effort
    }
  }

  if (managerItems.length) {
    const list = managerItems
      .map((i) => `<li><strong>${i.name}</strong> — ${i.label}: ${i.stateLabel}</li>`)
      .join("");
    const body = `These uploaded certificates are waiting on a manager. Review and confirm them on the Compliance page.<ul>${list}</ul>`;
    try {
      await sendEmail({
        to: adminEmails(),
        subject: "Certificates awaiting review / confirmation",
        html: emailLayout("Compliance queue", body, "/credentials"),
      });
      sent++;
    } catch {
      // best-effort
    }
  }

  if (remindedIds.length) {
    const ts = new Date();
    for (const id of remindedIds) {
      await db.update(credentials).set({ lastRemindedAt: ts }).where(eq(credentials.id, id));
    }
  }

  return new Response(`Sent ${sent} reminder email(s)`, { status: 200 });
}
