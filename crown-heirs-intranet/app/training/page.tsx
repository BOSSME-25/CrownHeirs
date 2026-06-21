import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import SiteHeader from "@/components/SiteHeader";
import DocumentList from "@/components/DocumentList";
import VideoDeleteButton from "@/components/VideoDeleteButton";
import { addVideo, updateVideoSection } from "@/app/training/actions";
import { listVideos } from "@/lib/training";
import type { TrainingVideo } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Training — Crown Heirs Team Hub" };

const UNCATEGORIZED = "General";

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

  // Group videos by section, preserving first-appearance order; put
  // uncategorized videos under "General" at the end.
  const order: string[] = [];
  const groups = new Map<string, TrainingVideo[]>();
  for (const v of videos) {
    const key = v.section?.trim() || UNCATEGORIZED;
    if (!groups.has(key)) {
      groups.set(key, []);
      if (key !== UNCATEGORIZED) order.push(key);
    }
    groups.get(key)!.push(v);
  }
  if (groups.has(UNCATEGORIZED)) order.push(UNCATEGORIZED);

  const existingSections = order.filter((s) => s !== UNCATEGORIZED);

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Training</div>
          <h1 className="title">Training &amp; Development</h1>
          <p className="lede">
            Onboarding for new team members and ongoing education for everyone —
            video guides organized by section, plus documents below.
          </p>
        </div>

        {/* Section suggestions shared by the add form and per-video editors */}
        <datalist id="sections">
          {existingSections.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

        <h2 className="title" style={{ fontSize: "1.4rem" }}>Training Videos</h2>

        {admin && (
          <form className="prose" action={addVideo} style={{ margin: "16px 0 24px" }}>
            <h2>Add a video</h2>
            <p className="muted" style={{ marginBottom: 14 }}>
              Paste any YouTube link — we’ll embed the player automatically.
            </p>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="title">Title *</label>
                <input id="title" name="title" required placeholder="e.g. Color Consultation Basics" />
              </div>
              <div className="field">
                <label htmlFor="section">Section</label>
                <input id="section" name="section" list="sections" placeholder="e.g. Onboarding, Color, Front Desk" />
              </div>
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
          order.map((section) => (
            <section key={section} style={{ marginBottom: 32 }}>
              <h3 className="section-head">{section}</h3>
              <div className="video-grid">
                {groups.get(section)!.map((v) => (
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
                        <div className="video-admin">
                          <form action={updateVideoSection.bind(null, v.id)} className="section-edit">
                            <input name="section" list="sections" defaultValue={v.section ?? ""} placeholder="Section" />
                            <button className="btn btn-ghost" type="submit">Save</button>
                          </form>
                          <VideoDeleteButton id={v.id} title={v.title} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}

        {/* Documents */}
        <h2 className="title" style={{ fontSize: "1.4rem", marginTop: 40 }}>Training Materials</h2>
        <DocumentList category="training" />
      </main>
    </>
  );
}
