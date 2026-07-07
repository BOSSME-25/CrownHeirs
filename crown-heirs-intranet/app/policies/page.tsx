import SiteHeader from "@/components/SiteHeader";
import DocumentList from "@/components/DocumentList";

export const metadata = { title: "Policies — Crown Heirs Team Hub" };

export default function PoliciesPage() {
  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Policies & Procedures</div>
          <h1 className="title">Policies & Procedures</h1>
          <p className="lede">
            The standards that keep the salon safe, professional, and consistent.
            Full policy documents are linked below.
          </p>
        </div>

        <div className="prose">
          <h2>Health & Safety</h2>
          <p>
            Sanitation, tool disinfection, and chemical handling expectations.
            Replace with your official procedures or upload the policy document.
          </p>

          <h2>Client Care</h2>
          <p>
            Consultation standards, handling complaints, refunds, and rebooking.
          </p>

          <h2>Conduct & Attendance</h2>
          <p>
            Dress code, professionalism, attendance, and what to do when you’re
            running late or out sick.
          </p>
        </div>

        <h2 className="title" style={{ fontSize: "1.4rem", marginTop: 36 }}>Policy Documents</h2>
        <DocumentList category="policies" />
      </main>
    </>
  );
}
