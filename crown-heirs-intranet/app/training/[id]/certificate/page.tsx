import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import PrintButton from "@/components/PrintButton";
import { getEmployeeByEmail } from "@/lib/employees";
import {
  PASS_PCT,
  getVideo,
  getWatchedAt,
  hasWatched,
  lastAttempt,
  listQuestions,
} from "@/lib/training";

export const dynamic = "force-dynamic";
export const metadata = { title: "Certificate — Crown Heirs Team Hub" };

function fmtDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", { timeZone: "America/Phoenix", month: "long", day: "numeric", year: "numeric" });
}

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;

  const video = await getVideo(id);
  if (!video) notFound();

  const employee = session?.user?.email ? await getEmployeeByEmail(session.user.email) : undefined;

  let complete = false;
  let scoreLine: string | null = null;
  let completedOn: Date | null = null;

  if (employee) {
    const questions = await listQuestions(id);
    const watched = await hasWatched(id, employee.id);
    const attempt = await lastAttempt(id, employee.id);
    if (questions.length > 0) {
      const passed = attempt ? attempt.score / attempt.total >= PASS_PCT : false;
      complete = passed;
      if (attempt) {
        scoreLine = `Score: ${attempt.score}/${attempt.total} (${Math.round((attempt.score / attempt.total) * 100)}%)`;
        completedOn = attempt.takenAt ? new Date(attempt.takenAt) : null;
      }
    } else {
      complete = watched;
      const w = await getWatchedAt(id, employee.id);
      completedOn = w ? new Date(w) : null;
    }
  }

  return (
    <>
      <div className="no-print">
        <SiteHeader />
      </div>
      <main className="wrap">
        {!employee ? (
          <div className="notice">You need to be on the team roster to earn a certificate.</div>
        ) : !complete ? (
          <div className="notice">
            You haven’t completed this training yet.{" "}
            <Link href={`/training/${id}`} style={{ color: "var(--terra)" }}>Go finish it →</Link>
          </div>
        ) : (
          <>
            <div className="certificate">
              <div className="cert-mark">Crown Heirs</div>
              <div className="cert-kicker">Certificate of Completion</div>
              <p className="cert-pre">This certifies that</p>
              <div className="cert-name">{employee.fullName}</div>
              <p className="cert-pre">has successfully completed</p>
              <div className="cert-course">{video.title}</div>
              {scoreLine && <p className="cert-score">{scoreLine}</p>}
              <p className="cert-date">{completedOn ? fmtDate(completedOn) : ""}</p>
            </div>
            <div className="no-print" style={{ marginTop: 20, display: "flex", gap: 12 }}>
              <PrintButton />
              <Link className="btn btn-ghost" href={`/training/${id}`}>Back</Link>
            </div>
          </>
        )}
      </main>
    </>
  );
}
