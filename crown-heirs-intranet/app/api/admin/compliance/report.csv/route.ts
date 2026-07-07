import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import {
  cadenceLabel,
  complianceState,
  evidenceFor,
  levelLabel,
  listComplianceItems,
  prettyDate,
} from "@/lib/compliance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cell(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const session = await auth();
  if (!(await getAccess(session?.user?.email)).canManageTeam) return new Response("Forbidden", { status: 403 });

  let items;
  let evidence;
  try {
    items = await listComplianceItems();
    evidence = await evidenceFor(items.map((i) => i.id));
  } catch {
    return new Response("Compliance not set up", { status: 200 });
  }

  const header = ["Level", "Requirement", "Status", "Due date", "Cadence", "Responsible", "Last reviewed", "Evidence", "Needs verification", "Description"];
  const lines = [header.map(cell).join(",")];
  for (const i of items) {
    const s = complianceState({ status: i.status, dueAt: i.dueAt });
    lines.push(
      [
        levelLabel(i.level),
        i.title,
        s.label,
        i.dueAt ? prettyDate(i.dueAt) : "",
        cadenceLabel(i.cadence),
        i.responsibleEmail,
        i.lastReviewedAt ? new Date(i.lastReviewedAt).toISOString().slice(0, 10) : "",
        (evidence.get(i.id) ?? []).length,
        i.needsVerification ? "yes" : "",
        i.description,
      ]
        .map(cell)
        .join(","),
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="compliance-report-${today}.csv"`,
    },
  });
}
