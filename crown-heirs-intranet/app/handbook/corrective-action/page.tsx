import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export const metadata = { title: "Corrective Action Program — Crown Heirs Team Hub" };

function PointTable({ rows }: { rows: [string, string][] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="kpi-table" style={{ width: "100%", marginTop: 6, marginBottom: 14 }}>
        <thead><tr><th style={{ textAlign: "left" }}>Behavior</th><th style={{ textAlign: "left" }}>Points</th></tr></thead>
        <tbody>
          {rows.map(([b, p]) => (
            <tr key={b}><td style={{ textAlign: "left" }}>{b}</td><td style={{ textAlign: "left", whiteSpace: "nowrap" }}>{p}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CapHandbookPage() {
  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow"><Link href="/handbook" style={{ color: "var(--terra)", textDecoration: "none" }}>← Handbook</Link></div>
          <h1 className="title">The Corrective Action Program</h1>
          <p className="lede">Accountability you can see. Restoration you can earn.</p>
        </div>

        <div className="prose">
          <p><em>Companion to the Team Member Handbook, Section 9: Performance and Accountability.</em></p>

          <h2>Why CAP exists</h2>
          <p>
            The Corrective Action Program (CAP) makes accountability measurable, visible, and fair, so no one
            is ever surprised by where they stand and no one wonders whether the standards apply to everyone.
            CAP is built on a points system: behaviors below our standards earn points, points accumulate
            toward defined levels, and each level triggers a specific, documented response. Points also
            expire, and they can be earned back through consistency. The goal at every level is restoration —
            separation happens only when restoration is refused.
          </p>
          <ul>
            <li><strong>Points attach to behaviors, never outcomes.</strong> Revenue, rebooking, and retail are outcomes, handled through your monthly 1:1 — missing a revenue target will never earn you a point.</li>
            <li><strong>Clarity is kindness.</strong> Every point is communicated within 48 hours, in private, in writing. Your balance is visible to you at all times in the <strong>Crown Heirs Team Hub</strong> under <strong>Discipline &amp; Advancement</strong>.</li>
          </ul>

          <h2>What earns points</h2>
          <p>A rolling six-month window applies: every point expires six months from the date it was issued.</p>

          <h3>Reliability &amp; readiness</h3>
        </div>
        <PointTable rows={[
          ["Late check-in, 6 to 15 minutes past scheduled start", "0.5"],
          ["Late check-in, more than 15 minutes, or late without notice to leadership", "1"],
          ["Checkout not completed (station not reset, closing duties skipped)", "1"],
          ["Weekly assigned items below the 90% standard", "1"],
          ["Same-day call-out with proper notice per policy", "1"],
          ["Leaving before scheduled end without approval", "1"],
          ["No-call, no-show", "4"],
        ]} />
        <p className="muted" style={{ fontSize: "0.85rem" }}>A second no-call, no-show within the rolling window is treated as job abandonment.</p>

        <div className="prose"><h3>Guest experience standards</h3></div>
        <PointTable rows={[
          ["Station not sanitized or guest-ready between appointments", "1"],
          ["Skipping a required playbook moment (consultation confirmation, the reveal, maintenance plan)", "1"],
          ["Guest complaint traced to conduct or preventable neglect (not a technical miss in good faith)", "2"],
        ]} />

        <div className="prose"><h3>Conduct &amp; culture</h3></div>
        <PointTable rows={[
          ["Unprofessional communication with a guest, teammate, or leadership", "2"],
          ["Disruption of the environment (gossip, drama, conflict carried onto the floor)", "2"],
          ["Online or social conduct connected to the brand that violates the conduct standards", "3"],
        ]} />

        <div className="prose">
          <h2>What never earns points</h2>
          <p>The following never earn points, ever:</p>
          <ul>
            <li>Earned paid sick time under Arizona&rsquo;s Fair Wages and Healthy Families Act, for yourself or a covered family member.</li>
            <li>Absences covered by law: jury duty, court subpoena, voting leave, military obligations, domestic violence leave, and any legally protected leave.</li>
            <li>Documented medical emergencies and hospitalizations.</li>
            <li>Bereavement within policy.</li>
            <li>Religious observance arranged in advance.</li>
            <li>Approved schedule changes, approved time off, and anything leadership signed off on beforehand.</li>
            <li>Weather and road closures declared unsafe by authorities.</li>
          </ul>
          <p>If a protected or excluded absence is ever pointed by mistake, the point is removed the day the error is identified, and the record notes the correction.</p>

          <div className="notice" style={{ margin: "16px 0" }}>
            <strong>Immediate-action offenses.</strong> Some conduct does not accumulate points — it resolves
            immediately through investigation and leadership decision, up to and including same-day
            separation: harassment/discrimination/threats/violence; theft, fraud, or falsifying records;
            working under the influence; performing services outside your licensure or exempt scope; breach
            of guest privacy; and safety violations that put a guest or teammate at risk.
          </div>

          <h2>Thresholds &amp; CAP levels</h2>
          <p>Points within the rolling six-month window accumulate toward four levels:</p>
        </div>
        <PointTable rows={[
          ["2 points — Level 1: Coaching", "Private, documented coaching conversation within one week."],
          ["4 points — Level 2: Written Warning", "Written warning with a 30-day development plan, signed by both parties."],
          ["6 points — Level 3: Final Warning", "Final written warning + structured 30-day plan with weekly check-ins."],
          ["8 points — Separation", "Employment ends (or the contractor agreement is terminated)."],
        ]} />

        <div className="prose">
          <h2>Expiration &amp; Restoration Credits</h2>
          <ul>
            <li><strong>Expiration.</strong> Every point expires six months from the date issued, automatically.</li>
            <li><strong>Restoration Credits.</strong> Thirty consecutive scheduled days with zero incidents removes one point from your balance. Balances do not go below zero, and a credit does not end an active Level 3 plan early.</li>
          </ul>

          <h2>How points are communicated &amp; tracked</h2>
          <ul>
            <li>Every point is communicated privately within 48 hours, in writing, with the date, the behavior, and the value.</li>
            <li>Your current balance is available to you at any time in the Team Hub, and reviewed as a standing line item in your monthly 1:1.</li>
            <li>Points are logged by leadership, with check-in data pulled from the Crown Heirs Team Hub rather than memory.</li>
            <li>Disputes go to leadership in writing within 7 days of notification. If the facts do not support the point, it comes off.</li>
            <li>Levels are always delivered face to face, never by text, never in front of the team.</li>
          </ul>

          <p className="muted">
            <strong>Clarity is kindness. Consistency protects the culture.</strong> See your live standing under{" "}
            <strong>Discipline &amp; Advancement</strong>.
          </p>
        </div>
      </main>
    </>
  );
}
