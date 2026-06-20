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
          <h2>Our Mission</h2>
          <p>
            Crown Heirs exists to make every guest feel like royalty — through
            exceptional craft, warm hospitality, and a salon experience that
            keeps people coming back. This handbook is a placeholder; replace
            this text with your official handbook content, or simply upload the
            handbook PDF in the Admin area.
          </p>

          <h2>What We Expect</h2>
          <ul>
            <li>Show up on time, prepared, and ready to give clients your best.</li>
            <li>Keep your station, tools, and shared spaces clean and sanitized.</li>
            <li>Communicate openly with the team and with leadership.</li>
            <li>Protect client trust and confidentiality at all times.</li>
          </ul>

          <h2>Scheduling, Pay & Time Off</h2>
          <p>
            Replace this section with your specifics on shifts, booking, pay
            structure, commissions, tips, and how to request time off.
          </p>
        </div>

        <h2 className="title" style={{ fontSize: "1.4rem", marginTop: 36 }}>Handbook Documents</h2>
        <DocumentList category="handbook" />
      </main>
    </>
  );
}
