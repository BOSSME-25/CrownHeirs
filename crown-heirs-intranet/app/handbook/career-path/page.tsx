import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";

export const metadata = { title: "Career Path — Crown Heirs Team Hub" };

export default function CareerPathHandbookPage() {
  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow"><Link href="/handbook" style={{ color: "var(--terra)", textDecoration: "none" }}>← Handbook</Link></div>
          <h1 className="title">Your Path at Crown Heirs</h1>
          <p className="lede">The Specialty Stylist career framework — your seat in the throne.</p>
        </div>

        <div className="prose">
          <h2>Your track</h2>
          <p>
            You practice natural hair services that Arizona law exempts from cosmetology licensure —
            braiding, locs, twists, weaves, and tension-based extensions installed without chemical
            alteration. Under A.R.S. § 32-506(10), your work is recognized as a distinct craft, separate
            from cosmetology. Crown Heirs honors that distinction by giving you a track of your own — at
            full parity with our licensed stylists.
          </p>
          <p>
            The Specialty Track moves through three tiers and caps at Senior Specialty Stylist. You are
            honored, you are valued, and you are at parity with licensed stylists at every step.
          </p>

          <h2>The Specialty Track at a glance</h2>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="kpi-table" style={{ width: "100%", marginTop: 8 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Tier</th>
                <th style={{ textAlign: "left" }}>Title</th>
                <th style={{ textAlign: "left" }}>Commission</th>
                <th style={{ textAlign: "left" }}>PT target</th>
                <th style={{ textAlign: "left" }}>FT target</th>
              </tr>
            </thead>
            <tbody>
              <tr><td style={{ textAlign: "left" }}>S-I</td><td style={{ textAlign: "left" }}>Associate Specialty Stylist</td><td style={{ textAlign: "left" }}>40%</td><td style={{ textAlign: "left" }}>$3,000/mo</td><td style={{ textAlign: "left" }}>$4,800/mo</td></tr>
              <tr><td style={{ textAlign: "left" }}>S-II</td><td style={{ textAlign: "left" }}>Specialty Stylist</td><td style={{ textAlign: "left" }}>45%</td><td style={{ textAlign: "left" }}>$3,600/mo</td><td style={{ textAlign: "left" }}>$5,600/mo</td></tr>
              <tr><td style={{ textAlign: "left" }}>S-III</td><td style={{ textAlign: "left" }}>Senior Specialty Stylist</td><td style={{ textAlign: "left" }}>50%</td><td style={{ textAlign: "left" }}>$4,200/mo</td><td style={{ textAlign: "left" }}>$6,400/mo</td></tr>
            </tbody>
          </table>
        </div>

        <div className="prose" style={{ marginTop: 20 }}>
          <h2>Why the track caps at S-III</h2>
          <p>
            The Master tier and Crown Educator designation on the Licensed Track are reserved for licensed
            cosmetologists — a function of Arizona Board of Barbering and Cosmetology rules, since Crown
            Educators serve as state-approved apprenticeship mentors, which legally requires full
            cosmetology licensure. Your craft is honored and valued at parity with Senior Stylists on the
            Licensed Track.
          </p>

          <h2>If you want to go further</h2>
          <p>
            To access the Master tier or the Crown Educator role, Crown Heirs supports your path through the
            Crown Heirs Apprenticeship Program — earn your Arizona cosmetology license through our
            DES-registered apprenticeship while continuing to work at The Den. This is a real path, and we
            will walk it with you.
          </p>

          <h2>Your entry to Crown Heirs</h2>
          <p>Where you start depends on your documented experience and book of business — a recognition of evidence.</p>
          <ul>
            <li><strong>Standard Entry — S-I (40%).</strong> The default path for specialty stylists building their book: documented exempt-scope practice, a paid working-interview trial day, two professional references, and CEO/COO endorsement.</li>
            <li><strong>Experienced Entry — S-II (45%).</strong> 3+ years of specialty practice, a documented book ($5,600/mo FT or $3,600/mo PT for the prior 6 months, or 40+ active clients transferring), two references, a trial day, and CEO &amp; COO endorsement. Includes a 60-day probation reviewed at 30 and 60 days.</li>
            <li><strong>Exceptional Entry — S-III (50%).</strong> By leadership invitation only: 5+ years, documented revenue at S-III level and 60%+ rebooking for the prior 6 months, three references, and joint CEO/COO endorsement. Same 60-day probation framework.</li>
          </ul>

          <h2>The five metrics</h2>
          <p>Revenue (primary), client rebooking, retail attach, continuing education, and culture contribution. Tier promotions are reviewed every January and July using your prior six months, with monthly 1:1s to track your numbers.</p>

          <h2>Part-time vs. full-time</h2>
          <p>Part-time is under 30 hours per week or 3 scheduled days or fewer. Full-time is 30+ hours per week or 4+ scheduled days. Check-in, checkout, and assigned items are tracked in the <strong>Crown Heirs Team Hub</strong>.</p>

          <div className="notice" style={{ margin: "16px 0" }}>
            <strong>Compliance note.</strong> As a Specialty Stylist you operate strictly within the exempt
            scope. Any application of dyes, reactive chemicals, or structural alteration preparations falls
            outside the exemption and is not permitted without proper licensure. Crown Heirs maintains the
            required signage where specialty services are provided.
          </div>

          <h2>Earning beyond the chair</h2>
          <p>
            Retail attach commission, a continuing-education stipend for specialty certifications that grow
            your book, signature certification pathways, Academy faculty positions as we expand, and retail
            performance bonuses tied to monthly goals.
          </p>

          <p className="muted">
            Track your tier and what the next one requires under <strong>Discipline &amp; Advancement</strong>.
          </p>
        </div>
      </main>
    </>
  );
}
