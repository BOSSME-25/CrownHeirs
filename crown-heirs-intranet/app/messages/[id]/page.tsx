import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import Avatar from "@/components/Avatar";
import { sendMessage } from "@/app/messages/actions";
import { getEmployee, getEmployeeByEmail } from "@/lib/employees";
import { markRead, threadBetween } from "@/lib/messages";

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
            thread.map((m) => (
              <div key={m.id} className={`msg-bubble ${m.senderId === me.id ? "mine" : "theirs"}`}>
                <div className="msg-text">{m.body}</div>
                <div className="msg-time">{fmt(m.createdAt)}</div>
              </div>
            ))
          )}
        </div>

        <form action={sendMessage.bind(null, other.id)} className="msg-form">
          <input name="body" placeholder="Type a message…" autoComplete="off" required />
          <button className="btn" type="submit">Send</button>
        </form>
      </main>
    </>
  );
}
