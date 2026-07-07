import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { capPoints, employees } from "@/lib/db/schema";
import { getDefaultOrg } from "@/lib/org";
import { balanceFromRows, RESTORATION_DAYS } from "@/lib/cap";
import type { CapPoint } from "@/lib/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Daily: expire points past their window, and grant Restoration Credits after
// a clean stretch (approximated as calendar days with no new active point/credit).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  let expired = 0;
  let credits = 0;
  try {
    // 1) Expire.
    const actives = await db.select().from(capPoints).where(eq(capPoints.status, "active"));
    for (const p of actives) {
      if (!p.isCredit && p.expiresAt && p.expiresAt < today) {
        await db.update(capPoints).set({ status: "expired", updatedAt: new Date() }).where(eq(capPoints.id, p.id));
        expired++;
      }
    }

    // 2) Restoration credits — one per employee whose last CAP event is >= 30 days old and who still carries a balance.
    const org = await getDefaultOrg();
    const emps = await db.select({ id: employees.id }).from(employees).where(eq(employees.status, "active"));
    const live = await db.select().from(capPoints).where(eq(capPoints.status, "active"));
    const byEmp = new Map<string, CapPoint[]>();
    for (const p of live) {
      if (!byEmp.has(p.employeeId)) byEmp.set(p.employeeId, []);
      byEmp.get(p.employeeId)!.push(p);
    }
    const now = Date.now();
    for (const e of emps) {
      const rows = byEmp.get(e.id) ?? [];
      if (balanceFromRows(rows, today) <= 0) continue;
      // Most recent event (activeAt for points, createdAt for credits).
      let last = 0;
      for (const p of rows) {
        const t = new Date((p.isCredit ? p.createdAt : p.activeAt) ?? p.createdAt ?? 0).getTime();
        if (t > last) last = t;
      }
      if (last && (now - last) / 86400000 >= RESTORATION_DAYS) {
        await db.insert(capPoints).values({
          orgId: org?.id ?? null,
          employeeId: e.id,
          infractionType: "restoration_credit",
          points: "-1",
          note: `${RESTORATION_DAYS} clean days`,
          status: "active",
          isCredit: true,
          activeAt: new Date(),
        });
        credits++;
      }
    }
  } catch {
    return new Response("Not set up", { status: 200 });
  }

  return new Response(`Expired ${expired}, credited ${credits}`, { status: 200 });
}
