import { adminEmails, emailLayout, sendEmail } from "@/lib/email";
import { buildTeamKpiCsv } from "@/lib/kpiReport";
import { getKpis } from "@/lib/square";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

// Renders the salon-wide totals as an email-safe HTML table.
async function salonWideHtml(): Promise<string> {
  const r = await getKpis();
  if (!r.configured || !("periods" in r)) return "";
  const rows = r.periods
    .map(
      (p) => `<tr>
        <td style="padding:6px 12px;border-top:1px solid #eee">${p.label}</td>
        <td style="padding:6px 12px;border-top:1px solid #eee;text-align:right"><strong>${money.format(p.sales)}</strong></td>
        <td style="padding:6px 12px;border-top:1px solid #eee;text-align:right">${p.count}</td>
        <td style="padding:6px 12px;border-top:1px solid #eee;text-align:right">${money.format(p.avg)}</td>
        <td style="padding:6px 12px;border-top:1px solid #eee;text-align:right">${money.format(p.tips)}</td>
      </tr>`,
    )
    .join("");
  return `
    <p style="margin:0 0 6px"><strong>Salon-wide totals</strong></p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;margin-bottom:18px">
      <thead><tr style="text-align:left;color:#a0624a;font-size:12px;text-transform:uppercase">
        <th style="padding:6px 12px">Period</th>
        <th style="padding:6px 12px;text-align:right">Sales</th>
        <th style="padding:6px 12px;text-align:right">Sales #</th>
        <th style="padding:6px 12px;text-align:right">Avg</th>
        <th style="padding:6px 12px;text-align:right">Tips</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Weekly KPI digest, triggered by Vercel Cron (see vercel.json).
export async function GET(req: Request) {
  // Vercel attaches `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const report = await buildTeamKpiCsv();
  const salonHtml = await salonWideHtml();

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

  const body =
    salonHtml +
    (report.ok
      ? "Attached is this week’s per-stylist report — tips, clients served, and repeat-client retention for the last 7, 30, and 90 days."
      : `Per-stylist report not included (${report.reason}).`);

  await sendEmail({
    to: recipients,
    subject: `Weekly KPIs — ${today}`,
    html: emailLayout("Weekly KPIs", body, "/kpis"),
    attachments: report.ok
      ? [{ filename: report.filename, content: report.csv, contentType: "text/csv" }]
      : undefined,
  });

  return new Response("Sent", { status: 200 });
}
