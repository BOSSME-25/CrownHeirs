import SiteHeader from "@/components/SiteHeader";
import DocumentList from "@/components/DocumentList";

export const metadata = { title: "Handbook — Crown Heirs Team Hub" };

export default function HandbookPage() {
  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Employee Handbook</div>
          <h1 className="title">The Crown Heirs Handbook</h1>
          <p className="lede">
            Start here. The handbook covers who we are and what we expect of one
            another. The official PDF and any updates are linked below.
          </p>
        </div>

        <div className="prose">
          <h2>Handbook Mission Statement</h2>
          <p>
            This handbook exists to protect what makes Crown Heirs Hair Den more
            than a salon. We are stewards of an environment — a space of
            transformation, peace, and purpose where every guest is seen,
            valued, and crowned. The standards within these pages are how we keep
            that environment whole: not as rules imposed, but as a shared
            commitment to excellence, integrity, and care. Clarity is kindness.
            Consistency protects the culture. When each of us upholds the same
            standard, the brand reads through in every chair, every interaction,
            every visit.
          </p>

          <h2>What We Expect</h2>
          <ul>
            <li><strong>Christ-centered character.</strong> Integrity, humility, and accountability in every interaction — in the salon, online, and anywhere connected to our brand.</li>
            <li><strong>Excellence as a habit, not an act.</strong> Consistent, high-quality service delivery is the baseline, not the goal. Culture outweighs talent.</li>
            <li><strong>Protection of the environment.</strong> The atmosphere is the product. Every team member is responsible for the peace, professionalism, and emotional safety of the space.</li>
            <li><strong>Customer intentionality.</strong> Every guest is treated with dignity, care, and attention. Each appointment is an exchange of energy, excellence, and education.</li>
            <li><strong>Reliability and readiness.</strong> Punctuality, preparedness, schedule adherence, and follow-through are non-negotiable standards of the role.</li>
            <li><strong>Communication with class.</strong> Professional, respectful, and clear — with leadership, with teammates, and with guests.</li>
            <li><strong>Community contribution.</strong> We grow stronger by pouring into one another. Team unity and mentorship strengthen the whole.</li>
            <li><strong>Brand alignment.</strong> Conduct that disrupts team unity, compromises client experience, or misrepresents Crown Heirs may result in corrective action up to and including termination.</li>
          </ul>

          <h2>How to Use This Handbook</h2>
          <p>
            This handbook is your reference for the standards, expectations, and
            culture that define Crown Heirs Hair Den. It is a living document —
            review it during onboarding, return to it often, and treat it as the
            source of truth whenever a question of conduct, process, or
            expectation arises. Adherence to these standards is a condition of
            employment and a reflection of the commitment each of us makes to
            this brand and one another. Where you need clarification, bring it to
            leadership directly; we would always rather answer a question than
            correct an avoidable misstep.
          </p>
        </div>

        <h2 className="title" style={{ fontSize: "1.4rem", marginTop: 36 }}>Handbook Documents</h2>
        <DocumentList category="handbook" />
      </main>
    </>
  );
}
