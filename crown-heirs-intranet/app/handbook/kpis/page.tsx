import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export const metadata = { title: "KPIs & Expectations — Crown Heirs Team Hub" };

const TIERS = [
  { tier: "I / S-I Associate (40%)", pt: "$3,200", ft: "$5,000", hr: "~$38", rebook: "40%+", retail: "Learning", ce: "None", teach: "None" },
  { tier: "II / S-II Stylist (45%)", pt: "$3,800", ft: "$6,000", hr: "~$45", rebook: "50%+", retail: "10%+", ce: "4", teach: "None" },
  { tier: "III / S-III Senior (50%)", pt: "$4,400", ft: "$6,800", hr: "~$52", rebook: "60%+", retail: "15%+", ce: "8", teach: "Shadow host, 30-day buddy" },
  { tier: "IV Master (55%)", pt: "$5,000", ft: "$7,500", hr: "~$58", rebook: "70%+", retail: "20%+", ce: "12", teach: "Internal classes quarterly" },
  { tier: "IV+E Crown Educator (60%)", pt: "$5,000", ft: "$7,500", hr: "~$58", rebook: "70%+", retail: "20%+", ce: "12 + cert", teach: "Apprentice supervision" },
  { tier: "Apprentice (hourly)", pt: "Program hours", ft: "Program hours", hr: "n/a", rebook: "n/a", retail: "n/a", ce: "Program", teach: "n/a" },
];

export default function KpisHandbookPage() {
  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow"><Link href="/handbook" style={{ color: "var(--terra)", textDecoration: "none" }}>← Handbook</Link></div>
          <h1 className="title">KPIs &amp; Expectations by Tier</h1>
          <p className="lede">The standards that drive our success and shape our culture.</p>
        </div>

        <div className="prose">
          <h2>How this framework works</h2>
          <p>
            Every tier at Crown Heirs carries a set of measurable expectations. They are the floor for
            holding your tier and the ladder for reaching the next one. Your commission rate reflects the
            value you bring to The Den, and these KPIs are how that value is measured, month over month.
          </p>
          <p>
            Every role at every level is valued here for fully showing up. An Associate who checks in on
            time, keeps the station guest-ready, and cares for every person in the chair is doing this job
            completely. Titles and rates rise with skill, consistency, and what you build over time. They
            reward accomplishment. They do not rank worth.
          </p>

          <h2>A word on hours and productivity</h2>
          <p>
            Part-time at Crown Heirs is about 20 hours a week. Full-time is about 30. Those are suggested
            hours, not requirements — the revenue target is what we hold you to. You do not climb at Crown
            Heirs by working more hours. You climb by making each hour worth more: better consultations,
            stronger rebooking, service upgrades, retail education, and pricing that reflects your skill.
          </p>

          <h2>Review cadence</h2>
          <ul>
            <li>Monthly 1:1 with leadership to review your numbers — you will always know where you stand.</li>
            <li>Tier reviews every January and July, using your prior six months of performance.</li>
            <li>Missing a monthly target triggers a check-in conversation, not a surprise demotion. Every adjustment is documented, communicated, and supported.</li>
          </ul>

          <h2>Daily expectations, every tier</h2>
          <p>These apply to everyone in the building, and they are tracked in the <strong>Crown Heirs Team Hub</strong>.</p>
          <ul>
            <li><strong>Daily check-in.</strong> Check in through the Team Hub at or before your scheduled start time, with enough lead time that your station is guest-ready. Standard: on-time check-in on 95%+ of scheduled days.</li>
            <li><strong>Daily checkout.</strong> Check out through the Team Hub at the end of your day, station fully reset, and confirm your next day&rsquo;s schedule before you leave. Standard: checkout completed 100% of scheduled days.</li>
            <li><strong>Daily assigned items.</strong> Opening/closing duties, cleaning rotation, inventory notifications, and 1:1 action items. Standard: 90%+ weekly completion (100% for apprentices), tracked in the Team Hub.</li>
          </ul>
        </div>

        <h2 className="title" style={{ fontSize: "1.4rem", marginTop: 30 }}>Quick reference — all tiers</h2>
        <div style={{ overflowX: "auto" }}>
          <table className="kpi-table" style={{ width: "100%", marginTop: 8 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Tier</th>
                <th style={{ textAlign: "left" }}>PT / FT target</th>
                <th style={{ textAlign: "left" }}>Rev/hr</th>
                <th style={{ textAlign: "left" }}>Rebooking</th>
                <th style={{ textAlign: "left" }}>Retail</th>
                <th style={{ textAlign: "left" }}>CE hrs*</th>
                <th style={{ textAlign: "left" }}>Teaching</th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((t) => (
                <tr key={t.tier}>
                  <td style={{ textAlign: "left" }}>{t.tier}</td>
                  <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>{t.pt} / {t.ft}</td>
                  <td style={{ textAlign: "left" }}>{t.hr}</td>
                  <td style={{ textAlign: "left" }}>{t.rebook}</td>
                  <td style={{ textAlign: "left" }}>{t.retail}</td>
                  <td style={{ textAlign: "left" }}>{t.ce}</td>
                  <td style={{ textAlign: "left" }}>{t.teach}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ fontSize: "0.82rem", marginTop: 8 }}>
          *CE hours are per six-month review cycle. Every tier, every day: on-time check-in (95%+),
          full checkout &amp; station reset (100%), daily assigned items complete (90%+ weekly, 100% for apprentices).
        </p>

        <div className="prose" style={{ marginTop: 24 }}>
          <h2>New-hire revenue ramp</h2>
          <p>
            A stylist joining without an established Phoenix book gets a fair runway to full target — 50% of
            tier target in month 1, then 65%, 80%, 90%, 95%, and 100% by month 6. It applies to revenue only;
            check-in, checkout, assigned items, and culture expectations are 100% from day one. Ramp progress
            is reviewed in the monthly 1:1.
          </p>
          <p className="muted">
            See your live standing anytime under <strong>Discipline &amp; Advancement</strong>.
          </p>
        </div>
      </main>
    </>
  );
}
