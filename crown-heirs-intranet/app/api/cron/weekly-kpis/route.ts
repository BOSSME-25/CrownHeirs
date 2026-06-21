import { adminEmails, emailLayout, sendEmail } from "@/lib/email";
import { buildTeamKpiCsv } from "@/lib/kpiReport";

export const dynamic = "force-dynamic";

// Weekly KPI digest, triggered by Vercel Cron (see vercel.json).
export async function GET(req: Request) {
  // Vercel attaches `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const report = await buildTeamKpiCsv();
  if (!report.ok) {
    // Don't fail the cron — just report why nothing was sent.
    return new Response(`Skipped: ${report.reason}`, { status: 200 });
  }

  // Always include emily, bethany, and the admin inbox, plus any ADMIN_EMAILS.
  const recipients = [
    ...new Set([
      "admin@crownheirs.com",
      "emily@crownheirs.com",
      "bethany@crownheirs.com",
      ...adminEmails(),
    ]),
  ];

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  await sendEmail({
    to: recipients,
    subject: `Weekly team KPIs — ${today}`,
    html: emailLayout(
      "Weekly team KPIs",
      "Attached is this week’s team performance report — tips, clients served, and repeat-client retention for the last 7, 30, and 90 days.",
      "/kpis",
    ),
    attachments: [{ filename: report.filename, content: report.csv, contentType: "text/csv" }],
  });

  return new Response("Sent", { status: 200 });
}
