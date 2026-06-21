import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import SiteHeader from "@/components/SiteHeader";
import AddNoteForm from "@/components/AddNoteForm";
import DeleteNoteButton from "@/components/DeleteNoteButton";
import { getEmployeeByEmail } from "@/lib/employees";
import { activeEmployees } from "@/lib/schedule";
import { listAllOneOnOne, listMyOneOnOne, listTeamNotes, type OneOnOneNote } from "@/lib/notes";
import type { MeetingNote } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meeting Notes — Crown Heirs Team Hub" };

function fmt(d: string | Date | null) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d + "T00:00:00Z") : d;
  return date.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

function NoteCard({
  title,
  date,
  body,
  fileUrl,
  who,
  adminId,
}: {
  title: string;
  date: string | Date | null;
  body: string | null;
  fileUrl: string | null;
  who?: string | null;
  adminId?: string;
}) {
  return (
    <div className="prose" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        {adminId && <DeleteNoteButton id={adminId} title={title} />}
      </div>
      <p className="muted" style={{ marginTop: 2 }}>{fmt(date)}{who ? ` · ${who}` : ""}</p>
      {body && <p style={{ whiteSpace: "pre-wrap" }}>{body}</p>}
      {fileUrl && <a className="btn btn-ghost" href={fileUrl} target="_blank" rel="noopener noreferrer">Open attachment</a>}
    </div>
  );
}

export default async function NotesPage() {
  const session = await auth();
  const admin = isAdmin(session?.user?.email);
  const email = session?.user?.email ?? "";

  let setupNeeded = false;
  let teamNotes: MeetingNote[] = [];
  let oneOnOnes: OneOnOneNote[] = [];
  let roster: { id: string; fullName: string }[] = [];
  try {
    teamNotes = await listTeamNotes();
    const me = await getEmployeeByEmail(email);
    if (admin) {
      oneOnOnes = await listAllOneOnOne();
      roster = await activeEmployees();
    } else if (me) {
      oneOnOnes = await listMyOneOnOne(me.id);
    }
  } catch {
    setupNeeded = true;
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Meeting Notes</div>
          <h1 className="title">Meeting Notes</h1>
          <p className="lede">Notes from team meetings, plus private notes from your 1:1s.</p>
        </div>

        {setupNeeded ? (
          <div className="notice">
            The notes table isn’t set up yet. {admin
              ? "Go to Admin → “Set up / update database”, then come back."
              : "An admin needs to finish setup."}
          </div>
        ) : (
          <>
            {admin && <AddNoteForm employees={roster} />}

            <h2 className="title" style={{ fontSize: "1.4rem", marginTop: 8 }}>Team meetings</h2>
            {teamNotes.length === 0 ? (
              <p className="muted">No team notes yet.</p>
            ) : (
              teamNotes.map((n) => (
                <NoteCard key={n.id} title={n.title} date={n.meetingDate} body={n.body} fileUrl={n.fileUrl} adminId={admin ? n.id : undefined} />
              ))
            )}

            <h2 className="title" style={{ fontSize: "1.4rem", marginTop: 32 }}>
              {admin ? "1:1 notes (all)" : "My 1:1 notes"}
            </h2>
            <p className="muted" style={{ marginBottom: 12 }}>
              {admin
                ? "Visible only to management and the employee each note is about."
                : "These are private between you and management."}
            </p>
            {oneOnOnes.length === 0 ? (
              <p className="muted">No 1:1 notes{admin ? " yet" : " for you yet"}.</p>
            ) : (
              oneOnOnes.map((n) => (
                <NoteCard
                  key={n.id}
                  title={n.title}
                  date={n.meetingDate}
                  body={n.body}
                  fileUrl={n.fileUrl}
                  who={admin ? n.employeeName : undefined}
                  adminId={admin ? n.id : undefined}
                />
              ))
            )}
          </>
        )}
      </main>
    </>
  );
}
