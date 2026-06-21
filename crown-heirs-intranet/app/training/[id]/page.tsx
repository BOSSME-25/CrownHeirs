import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import SiteHeader from "@/components/SiteHeader";
import DeleteQuestionButton from "@/components/DeleteQuestionButton";
import { addQuestion, markWatched, setRequirement, submitQuiz } from "@/app/training/actions";
import { getEmployeeByEmail } from "@/lib/employees";
import {
  PASS_PCT,
  getVideo,
  hasWatched,
  lastAttempt,
  listQuestions,
  viewerStatuses,
} from "@/lib/training";

export const dynamic = "force-dynamic";
export const metadata = { title: "Training video — Crown Heirs Team Hub" };

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const admin = isAdmin(session?.user?.email);
  const { id } = await params;

  const video = await getVideo(id);
  if (!video) notFound();

  const questions = await listQuestions(id);
  const employee = session?.user?.email ? await getEmployeeByEmail(session.user.email) : undefined;

  const watched = employee ? await hasWatched(id, employee.id) : false;
  const attempt = employee ? await lastAttempt(id, employee.id) : undefined;
  const viewers = admin ? await viewerStatuses(id) : [];

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">
            <Link href="/training" style={{ color: "var(--terra)", textDecoration: "none" }}>← Back to training</Link>
          </div>
          <h1 className="title">{video.title}</h1>
          {video.section && <p className="lede">{video.section}</p>}
        </div>

        <div className="video-frame" style={{ borderRadius: "var(--r-l)", overflow: "hidden", maxWidth: 820 }}>
          <iframe
            src={`https://www.youtube.com/embed/${video.youtubeId}`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>

        {video.description && <p className="lede" style={{ marginTop: 16 }}>{video.description}</p>}

        {/* Watched status (staff) */}
        {employee && (
          <div className="prose" style={{ marginTop: 24 }}>
            {watched ? (
              <p className="notice ok" style={{ margin: 0 }}>✓ You’ve marked this video as watched.</p>
            ) : (
              <form action={markWatched.bind(null, id)}>
                <button className="btn" type="submit">Mark as watched</button>
              </form>
            )}
          </div>
        )}

        {/* Assessment (staff) */}
        {questions.length > 0 && employee && (
          <div className="prose" style={{ marginTop: 24 }}>
            <h2>Assessment</h2>
            {attempt && (
              <p className={`notice ${attempt.score / attempt.total >= PASS_PCT ? "ok" : "err"}`}>
                Last attempt: {attempt.score}/{attempt.total} (
                {Math.round((attempt.score / attempt.total) * 100)}%) —{" "}
                {attempt.score / attempt.total >= PASS_PCT ? "Passed" : "Keep practicing"}
              </p>
            )}
            <form action={submitQuiz.bind(null, id)}>
              {questions.map((q, qi) => (
                <fieldset key={q.id} className="quiz-q">
                  <legend>{qi + 1}. {q.prompt}</legend>
                  {q.options.map((opt, oi) => (
                    <label key={oi} className="quiz-opt">
                      <input type="radio" name={`q_${q.id}`} value={oi} required />
                      <span>{opt}</span>
                    </label>
                  ))}
                </fieldset>
              ))}
              <button className="btn" type="submit">{attempt ? "Retake assessment" : "Submit assessment"}</button>
            </form>
          </div>
        )}

        {/* Admin: requirement settings */}
        {admin && (
          <div className="prose" style={{ marginTop: 24 }}>
            <h2>Requirement</h2>
            <form action={setRequirement.bind(null, id)}>
              <div className="form-grid">
                <div className="field">
                  <label>
                    <input type="checkbox" name="required" defaultChecked={video.required} style={{ marginRight: 8 }} />
                    Required for all staff
                  </label>
                </div>
                <div className="field">
                  <label htmlFor="dueDate">Due date</label>
                  <input id="dueDate" name="dueDate" type="date" defaultValue={video.dueDate ?? ""} />
                </div>
              </div>
              <button className="btn btn-ghost" type="submit">Save requirement</button>
            </form>
          </div>
        )}

        {/* Admin: build assessment */}
        {admin && (
          <div className="prose" style={{ marginTop: 24 }}>
            <h2>Assessment questions ({questions.length})</h2>
            {questions.length === 0 ? (
              <p className="muted">No questions yet. Add one below to create an assessment.</p>
            ) : (
              <div className="duty-list" style={{ marginBottom: 18 }}>
                {questions.map((q, qi) => (
                  <div key={q.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <strong>{qi + 1}. {q.prompt}</strong>
                      <DeleteQuestionButton videoId={id} questionId={q.id} />
                    </div>
                    <ul style={{ margin: "6px 0 0 18px" }}>
                      {q.options.map((opt, oi) => (
                        <li key={oi} style={{ color: oi === q.correctIndex ? "#2f6b3c" : "var(--ink-mid)" }}>
                          {opt}{oi === q.correctIndex ? " ✓" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            <form action={addQuestion.bind(null, id)}>
              <div className="field">
                <label htmlFor="prompt">New question</label>
                <input id="prompt" name="prompt" required placeholder="What should they know?" />
              </div>
              <div className="form-grid">
                {[0, 1, 2, 3].map((i) => (
                  <div className="field" key={i}>
                    <label>
                      <input type="radio" name="correct" value={i} defaultChecked={i === 0} style={{ marginRight: 8 }} />
                      Option {i + 1}{i < 2 ? " *" : " (optional)"}
                    </label>
                    <input name={`option${i}`} placeholder={`Answer option ${i + 1}`} />
                  </div>
                ))}
              </div>
              <p className="muted" style={{ marginBottom: 10 }}>Select the radio next to the correct answer.</p>
              <button className="btn" type="submit">Add question</button>
            </form>
          </div>
        )}

        {/* Admin: who has watched + scores */}
        {admin && (
          <div className="prose" style={{ marginTop: 24 }}>
            <h2>Team progress</h2>
            {viewers.length === 0 ? (
              <p className="muted">No active team members yet.</p>
            ) : (
              <div className="req-list">
                {viewers.map((v) => (
                  <div className="req" key={v.employeeId}>
                    <div className="req-title">{v.name}</div>
                    <div className="req-right">
                      {v.score != null ? (
                        <span className={`status-badge ${v.score / (v.total ?? 1) >= PASS_PCT ? "approved" : "denied"}`}>
                          {v.score}/{v.total} ({Math.round((v.score / (v.total ?? 1)) * 100)}%)
                        </span>
                      ) : null}
                      <span className={`status-badge ${v.watched ? "approved" : "pending"}`}>
                        {v.watched ? "Watched" : "Not watched"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
