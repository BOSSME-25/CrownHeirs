import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { complianceItems } from "@/lib/db/schema";
import { adminEmails, emailLayout, sendEmail } from "@/lib/email";
import { managementEmails } from "@/lib/meetingRequests";
import { complianceState, levelLabel, listComplianceItems, prettyDate } from "@/lib/compliance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THROTTLE_MS = 7 * 24 * 60 * 60 * 1000;

// Nudges leadership about compliance items that are overdue or due soon.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let items;
  try {
    items = await listComplianceItems();
  } catch {
    return new Response("Compliance not set up", { status: 200 });
  }

  const now = Date.now();
  const flagged: { title: string; level: string; label: string; dueAt: string | null }[] = [];
  const remindedIds: string[] = [];
  for (const it of items) {
    const s = complianceState({ status: it.status, dueAt: it.dueAt });
    if (s.key !== "overdue" && s.key !== "due") continue;
    if (it.lastRemindedAt && now - new Date(it.lastRemindedAt).getTime() < THROTTLE_MS) continue;
    flagged.push({ title: it.title, level: it.level, label: s.label, dueAt: it.dueAt });
    remindedIds.push(it.id);
  }

  if (flagged.length) {
    const list = flagged
      .map((f) => `<li><strong>${f.title}</strong> — ${levelLabel(f.level)} · ${f.label}${f.dueAt ? ` (due ${prettyDate(f.dueAt)})` : ""}</li>`)
      .join("");
    const body = `These compliance items are overdue or due soon. Review them in the Compliance Center.<ul>${list}</ul>`;
    try {
      const to = await managementEmails();
      await sendEmail({
        to: to.length ? to : adminEmails(),
        subject: `Compliance: ${flagged.length} item(s) need attention`,
        html: emailLayout("Compliance review needed", body, "/admin/compliance"),
      });
    } catch {
      // best-effort
    }
    const ts = new Date();
    for (const id of remindedIds) {
      await db.update(complianceItems).set({ lastRemindedAt: ts }).where(eq(complianceItems.id, id));
    }
  }

  return new Response(`Flagged ${flagged.length}`, { status: 200 });
}
