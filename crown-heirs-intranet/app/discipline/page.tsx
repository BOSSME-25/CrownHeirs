import Link from "next/link";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import StatusPill from "@/components/StatusPill";
import { getEmployeeByEmail } from "@/lib/employees";
import {
  balanceFromRows,
  capLevelFor,
  categoryLabel,
  CAP_CATEGORIES,
  DISPUTE_DAYS,
  infractionById,
  infractionLabel,
  nextThreshold,
  nextTier,
  pointsForEmployee,
  tierById,
} from "@/lib/cap";
import { disputePoint } from "@/app/cap/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Discipline & Advancement — Crown Heirs Team Hub" };

function fmt(d: Date | string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function DisciplinePage() {
  const session = await auth();
  const email = session?.user?.email ?? "";
  const me = email ? await getEmployeeByEmail(email) : undefined;

  if (!me) {
    return (
      <>
        <SiteHeader />
        <main className="wrap">
          <div className="page-head"><h1 className="title">Discipline &amp; Advancement</h1></div>
          <div className="notice">You’re not on the team roster yet. Ask an admin to add you.</div>
        </main>
      </>
    );
  }

  let setupNeeded = false;
  let allPoints: Awaited<ReturnType<typeof pointsForEmployee>> = [];
  try {
    allPoints = await pointsForEmployee(me.id);
  } catch {
    setupNeeded = true;
  }

  const balance = balanceFromRows(allPoints);
  const level = capLevelFor(balance);
  const nextAt = nextThreshold(balance);
  const today = new Date().toISOString().slice(0, 10);
  const active = allPoints.filter((p) => p.status === "active" && !p.isCredit && (!p.expiresAt || p.expiresAt >= today));

  // Areas for awareness — categories where active points sit.
  const byCat = new Map<string, number>();
  for (const p of active) {
    const cat = infractionById(p.infractionType ?? "")?.category ?? "conduct";
    byCat.set(cat, (byCat.get(cat) ?? 0) + Number(p.points));
  }

  const curTier = tierById(me.tier);
  const next = nextTier(me.tier);

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Your standing</div>
          <h1 className="title">Discipline &amp; Advancement</h1>
          <p className="lede">Where you stand today, and what the next level up looks like. This is private to you and leadership.</p>
        </div>

        {setupNeeded ? (
          <div className="notice">Not set up yet — ask an admin to finish setup.</div>
        ) : (
          <>
            {/* ── Standing ── */}
            <section className="card" style={{ cursor: "default", marginBottom: 18 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "1.3rem" }}>Accountability</h2>
                <StatusPill label={`${balance} point${balance === 1 ? "" : "s"}`} tone={balance >= 6 ? "bad" : balance >= 2 ? "warn" : "ok"} />
                {level ? <span className="muted">{level.label}</span> : <span className="muted">In good standing</span>}
              </div>
              <p className="muted" style={{ fontSize: "0.85rem", marginTop: 8, marginBottom: 0 }}>
                {balance === 0
                  ? "You have no active points. Keep it up — 30 clean days earns a Restoration Credit."
                  : nextAt
                    ? `You are ${nextAt - balance} point${nextAt - balance === 1 ? "" : "s"} below the next level. Points expire six months after they’re issued, and 30 clean days earns a Restoration Credit.`
                    : "Reach out to leadership — let’s build your path back."}
              </p>
            </section>

            {/* ── Areas for awareness (color-highlighted) ── */}
            {active.length > 0 && (
              <section style={{ marginBottom: 18 }}>
                <h2 style={{ fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "1.15rem", margin: "0 0 8px" }}>Areas for awareness</h2>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  {CAP_CATEGORIES.filter((c) => byCat.has(c.id)).map((c) => (
                    <StatusPill key={c.id} label={`${categoryLabel(c.id)} · ${byCat.get(c.id)} pt`} tone={(byCat.get(c.id) ?? 0) >= 2 ? "bad" : "warn"} />
                  ))}
                </div>
                {active.map((p) => {
                  const withinWindow = !p.activeAt || (Date.now() - new Date(p.activeAt).getTime()) / 86400000 <= DISPUTE_DAYS;
                  return (
                    <div key={p.id} className="card" style={{ cursor: "default", padding: "10px 14px", marginBottom: 8 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ flex: 1, minWidth: 180, fontWeight: 600 }}>{infractionLabel(p.infractionType ?? "")}</span>
                        <StatusPill label={`${Number(p.points)} pt`} tone="warn" />
                        <span className="muted" style={{ fontSize: "0.8rem" }}>
                          {p.activeAt ? `Recorded ${fmt(p.activeAt)}` : ""}{p.expiresAt ? ` · expires ${fmt(p.expiresAt)}` : ""}
                        </span>
                      </div>
                      {p.note && <div className="muted" style={{ fontSize: "0.84rem", marginTop: 4 }}>{p.note}</div>}
                      {withinWindow && (
                        <details style={{ marginTop: 8 }}>
                          <summary className="btn-link" style={{ cursor: "pointer" }}>Dispute this (within {DISPUTE_DAYS} days)…</summary>
                          <form action={disputePoint} style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <input type="hidden" name="pointId" value={p.id} />
                            <input name="note" placeholder="Why do you believe this is in error?" style={{ flex: 1, minWidth: 200 }} required />
                            <button className="btn btn-ghost" type="submit">Send to leadership</button>
                          </form>
                        </details>
                      )}
                    </div>
                  );
                })}
              </section>
            )}

            {/* ── Advancement ── */}
            <section className="card" style={{ cursor: "default", marginBottom: 18 }}>
              <h2 style={{ margin: "0 0 6px", fontFamily: "var(--font-serif)", fontWeight: 600, fontSize: "1.3rem" }}>Advancement</h2>
              {curTier ? (
                <>
                  <p style={{ margin: "0 0 6px" }}>
                    You are a <strong>{curTier.label}</strong> <span className="muted">({curTier.track} Track)</span>.
                  </p>
                  {next ? (
                    <div className="notice" style={{ padding: "10px 12px" }}>
                      <strong>Next: {next.label}.</strong> {next.needs}
                    </div>
                  ) : (
                    <p className="muted">{curTier.needs}</p>
                  )}
                </>
              ) : (
                <p className="muted">Your tier is set with leadership in your monthly 1:1. See the full ladder and targets on the Career Path and KPIs pages.</p>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <Link className="btn btn-ghost" href="/handbook/kpis">KPIs &amp; targets</Link>
                <Link className="btn btn-ghost" href="/handbook/career-path">Career path</Link>
                <Link className="btn btn-ghost" href="/handbook/corrective-action">How CAP works</Link>
              </div>
            </section>

            <p className="muted" style={{ fontSize: "0.82rem" }}>
              Observed something a leader should know about a teammate? <Link href="/cap">Report an observation →</Link>
            </p>
          </>
        )}
      </main>
    </>
  );
}
