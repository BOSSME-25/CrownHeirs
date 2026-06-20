import SiteHeader from "@/components/SiteHeader";
import DocumentList from "@/components/DocumentList";

export const metadata = { title: "Documents — Crown Heirs Team Hub" };

export default function DocumentsPage() {
  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Library</div>
          <h1 className="title">All Documents</h1>
          <p className="lede">Every file uploaded to the team hub, newest first.</p>
        </div>
        <DocumentList />
      </main>
    </>
  );
}
