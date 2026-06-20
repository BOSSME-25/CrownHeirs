import SiteHeader from "@/components/SiteHeader";
import DocumentList from "@/components/DocumentList";

export const metadata = { title: "Training — Crown Heirs Team Hub" };

export default function TrainingPage() {
  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Training</div>
          <h1 className="title">Training & Development</h1>
          <p className="lede">
            Onboarding for new team members and ongoing education for everyone.
            Guides, videos, and checklists are linked below.
          </p>
        </div>

        <div className="prose">
          <h2>New Hire Onboarding</h2>
          <p>
            Your first-week checklist, systems to get set up on, and who to go to
            with questions. Replace with your onboarding flow or upload it.
          </p>

          <h2>Technique & Product Knowledge</h2>
          <p>
            Signature services, color lines, retail products, and the Crown Heirs
            way of doing each. Add guides and demo videos here.
          </p>

          <h2>Continuing Education</h2>
          <p>
            Classes, certifications, and resources to keep growing your craft.
          </p>
        </div>

        <h2 className="title" style={{ fontSize: "1.4rem", marginTop: 36 }}>Training Materials</h2>
        <DocumentList category="training" />
      </main>
    </>
  );
}
