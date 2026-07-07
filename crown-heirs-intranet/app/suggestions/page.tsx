import { desc } from "drizzle-orm";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import SiteHeader from "@/components/SiteHeader";
import DeleteSuggestionButton from "@/components/DeleteSuggestionButton";
import { setSuggestionStatus, submitSuggestion } from "@/app/suggestions/actions";
import { db } from "@/lib/db";
import { suggestions } from "@/lib/db/schema";
import type { Suggestion } from "@/lib/db/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suggestion Box — Crown Heirs Team Hub" };

function fmt(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", { timeZone: "America/Phoenix", month: "short", day: "numeric", year: "numeric" });
}

export default async function SuggestionsPage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  const canReview = access.canManageTeam; // directors + owners

  let all: Suggestion[] = [];
  let setupNeeded = false;
  if (canReview) {
    try {
      all = await db.select().from(suggestions).orderBy(desc(suggestions.createdAt));
    } catch {
      setupNeeded = true;
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Suggestion Box</div>
          <h1 className="title">Share an idea</h1>
          <p className="lede">
            Have a suggestion for the team or management? Send it here — you can choose to stay anonymous.
          </p>
        </div>

        <form className="prose" action={submitSuggestion}>
          <div className="field">
            <label htmlFor="message">Your suggestion</label>
            <textarea id="message" name="message" rows={4} required placeholder="What’s on your mind?" spellCheck />
          </div>
          <div className="field">
            <label><input type="checkbox" name="anonymous" style={{ marginRight: 8 }} />Submit anonymously</label>
          </div>
          <button className="btn" type="submit">Send suggestion</button>
          <p className="muted" style={{ marginTop: 10 }}>
            Anonymous suggestions don’t record your name.
          </p>
        </form>

        {canReview && (
          <>
            <h2 className="title" style={{ fontSize: "1.4rem", marginTop: 36 }}>Submitted suggestions</h2>
            {setupNeeded ? (
              <div className="notice">Run Admin → “Set up / update database”, then come back.</div>
            ) : all.length === 0 ? (
              <p className="muted">No suggestions yet.</p>
            ) : (
              <div className="req-list">
                {all.map((s) => (
                  <div className="req" key={s.id} style={{ alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div className="req-title" style={{ whiteSpace: "pre-wrap" }}>{s.message}</div>
                      <div className="req-meta">
                        {s.anonymous ? "Anonymous" : s.authorName ?? "Unknown"} · {s.createdAt ? fmt(s.createdAt) : ""}
                      </div>
                    </div>
                    <div className="req-right" style={{ flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                      <span className={`status-badge ${s.status === "reviewed" ? "approved" : "pending"}`}>{s.status}</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <form action={setSuggestionStatus.bind(null, s.id, s.status === "reviewed" ? "new" : "reviewed")} style={{ display: "inline" }}>
                          <button type="submit" className="btn btn-ghost">{s.status === "reviewed" ? "Reopen" : "Mark reviewed"}</button>
                        </form>
                        <DeleteSuggestionButton id={s.id} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}
