import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import SiteHeader from "@/components/SiteHeader";
import DocumentList from "@/components/DocumentList";
import VideoDeleteButton from "@/components/VideoDeleteButton";
import { addVideo } from "@/app/training/actions";
import { listVideos } from "@/lib/training";
import type { TrainingVideo } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Training — Crown Heirs Team Hub" };

export default async function TrainingPage() {
  const session = await auth();
  const admin = isAdmin(session?.user?.email);

  let videos: TrainingVideo[] = [];
  let setupNeeded = false;
  try {
    videos = await listVideos();
  } catch {
    setupNeeded = true;
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Training</div>
          <h1 className="title">Training &amp; Development</h1>
          <p className="lede">
            Onboarding for new team members and ongoing education for everyone —
            video guides, plus documents and checklists below.
          </p>
        </div>

        {/* Video library */}
        <h2 className="title" style={{ fontSize: "1.4rem" }}>Training Videos</h2>

        {admin && (
          <form className="prose" action={addVideo} style={{ margin: "16px 0 24px" }}>
            <h2>Add a video</h2>
            <p className="muted" style={{ marginBottom: 14 }}>
              Paste any YouTube link — we’ll embed the player automatically.
            </p>
            <div className="field">
              <label htmlFor="title">Title *</label>
              <input id="title" name="title" required placeholder="e.g. Color Consultation Basics" />
            </div>
            <div className="field">
              <label htmlFor="youtube">YouTube link *</label>
              <input id="youtube" name="youtube" required placeholder="https://www.youtube.com/watch?v=…" />
            </div>
            <div className="field">
              <label htmlFor="description">Description (optional)</label>
              <textarea id="description" name="description" rows={2} />
            </div>
            <button className="btn" type="submit">Add video</button>
          </form>
        )}

        {setupNeeded ? (
          <div className="notice">
            The training table isn’t set up yet. {admin
              ? "Go to Admin → “Set up / update database”, then come back."
              : "An admin needs to finish setup."}
          </div>
        ) : videos.length === 0 ? (
          <p className="muted">No training videos yet.{admin ? " Add one above." : ""}</p>
        ) : (
          <div className="video-grid">
            {videos.map((v) => (
              <div className="video-card" key={v.id}>
                <div className="video-frame">
                  <iframe
                    src={`https://www.youtube.com/embed/${v.youtubeId}`}
                    title={v.title}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <div className="video-meta">
                  <h3>{v.title}</h3>
                  {v.description && <p>{v.description}</p>}
                  {admin && (
                    <div style={{ marginTop: 10 }}>
                      <VideoDeleteButton id={v.id} title={v.title} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Documents */}
        <h2 className="title" style={{ fontSize: "1.4rem", marginTop: 40 }}>Training Materials</h2>
        <DocumentList category="training" />
      </main>
    </>
  );
}
