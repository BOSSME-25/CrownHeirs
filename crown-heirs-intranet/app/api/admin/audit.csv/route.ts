import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import { searchAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cell(v: string | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!(await getAccess(session?.user?.email)).canSystem) return new Response("Forbidden", { status: 403 });

  const p = new URL(request.url).searchParams;
  let rows;
  try {
    rows = await searchAudit({
      actor: p.get("actor"),
      q: p.get("q"),
      since: p.get("since"),
      until: p.get("until"),
      limit: 5000,
    });
  } catch {
    return new Response("Not set up", { status: 200 });
  }

  const lines = [["When (UTC)", "Who", "Action", "Entity", "Entity ID", "Details"].map(cell).join(",")];
  for (const e of rows) {
    lines.push(
      [
        e.createdAt ? new Date(e.createdAt).toISOString() : "",
        e.actorEmail,
        e.action,
        e.entity,
        e.entityId,
        e.detail,
      ]
        .map(cell)
        .join(","),
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="audit-log-${today}.csv"`,
    },
  });
}
