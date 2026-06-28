import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import Avatar from "@/components/Avatar";
import { sendMessage, toggleReaction } from "@/app/messages/actions";
import { getEmployee, getEmployeeByEmail } from "@/lib/employees";
import { markRead, reactionsFor, REACTION_EMOJIS, threadBetween } from "@/lib/messages";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conversation — Crown Heirs Team Hub" };

function fmt(d: Date | string | null) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-US", { timeZone: "America/Phoenix", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const { id } = await params;

  const me = session?.user?.email ? await getEmployeeByEmail(session.user.email) : undefined;
  if (!me) redirect("/messages");

  const other = await getEmployee(id);
  if (!other) notFound();

  await markRead(me.id, other.id);
  const thread = await threadBetween(me.id, other.id);
  const reactions = await reactionsFor(thread.map((m) => m.id), me.id);

  return (
    <>
      <SiteHeader />
      <main className="wrap" style={{ maxWidth: 720 }}>
        <div className="page-head">
          <div className="eyebrow">
            <Link href="/messages" style={{ color: "var(--terra)", textDecoration: "none" }}>← All messages</Link>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
            <Avatar name={other.fullName} src={other.photoUrl} size={44} />
            <h1 className="title" style={{ fontSize: "1.6rem" }}>{other.fullName}</h1>
          </div>
        </div>

        <div className="msg-thread">
          {thread.length === 0 ? (
            <p className="muted">No messages yet — say hello.</p>
          ) : (
            thread.map((m) => {
              const mine = m.senderId === me.id;
              const rx = reactions.get(m.id) ?? [];
              return (
                <div key={m.id} className={`msg-bubble ${mine ? "mine" : "theirs"}`}>
                  {m.body && <div className="msg-text">{m.body}</div>}
                  {m.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a href={m.imageUrl} target="_blank" rel="noopener noreferrer">
                      <img src={m.imageUrl} alt="attachment" style={{ maxWidth: "100%", borderRadius: 10, marginTop: m.body ? 6 : 0, display: "block" }} />
                    </a>
                  )}
                  <div className="msg-time">
                    {fmt(m.createdAt)}
                    {mine && <> · {m.readAt ? "Read" : "Sent"}</>}
                  </div>

                  {/* Reactions */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
                    {rx.map((r) => (
                      <form key={r.emoji} action={toggleReaction}>
                        <input type="hidden" name="messageId" value={m.id} />
                        <input type="hidden" name="otherId" value={other.id} />
                        <input type="hidden" name="emoji" value={r.emoji} />
                        <button
                          type="submit"
                          title={r.mine ? "Remove your reaction" : "React"}
                          style={{
                            cursor: "pointer",
                            fontSize: "0.8rem",
                            borderRadius: 999,
                            padding: "1px 8px",
                            border: `1px solid ${r.mine ? "var(--gold,#c8952a)" : "var(--border,#e7ded5)"}`,
                            background: r.mine ? "rgba(200,149,42,0.14)" : "transparent",
                          }}
                        >
                          {r.emoji} {r.count}
                        </button>
                      </form>
                    ))}
                    <details style={{ position: "relative" }}>
                      <summary style={{ listStyle: "none", cursor: "pointer", fontSize: "0.9rem", opacity: 0.6 }} title="Add reaction">＋</summary>
                      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                        {REACTION_EMOJIS.map((e) => (
                          <form key={e} action={toggleReaction}>
                            <input type="hidden" name="messageId" value={m.id} />
                            <input type="hidden" name="otherId" value={other.id} />
                            <input type="hidden" name="emoji" value={e} />
                            <button type="submit" style={{ cursor: "pointer", fontSize: "1rem", background: "transparent", border: "none", padding: 2 }}>{e}</button>
                          </form>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form action={sendMessage.bind(null, other.id)} className="msg-form" encType="multipart/form-data">
          <input name="body" placeholder="Type a message…" autoComplete="off" />
          <label className="btn btn-ghost" style={{ cursor: "pointer" }} title="Attach a photo">
            📷
            <input name="image" type="file" accept="image/*" style={{ display: "none" }} />
          </label>
          <button className="btn" type="submit">Send</button>
        </form>
        <p className="muted" style={{ fontSize: "0.75rem", marginTop: 6 }}>Type a message or attach a photo (or both).</p>
      </main>
    </>
  );
}
