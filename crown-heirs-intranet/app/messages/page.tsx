import Link from "next/link";
import { auth } from "@/auth";
import SiteHeader from "@/components/SiteHeader";
import Avatar from "@/components/Avatar";
import { getEmployeeByEmail } from "@/lib/employees";
import { conversationsFor, type Conversation } from "@/lib/messages";

export const dynamic = "force-dynamic";
export const metadata = { title: "Messages — Crown Heirs Team Hub" };

export default async function MessagesPage() {
  const session = await auth();
  const email = session?.user?.email ?? "";

  let setupNeeded = false;
  let me;
  let convos: Conversation[] = [];
  try {
    me = await getEmployeeByEmail(email);
    if (me) convos = await conversationsFor(me.id);
  } catch {
    setupNeeded = true;
  }

  return (
    <>
      <SiteHeader />
      <main className="wrap">
        <div className="page-head">
          <div className="eyebrow">Messages</div>
          <h1 className="title">Messages</h1>
          <p className="lede">Direct messages with your teammates.</p>
        </div>

        {setupNeeded ? (
          <div className="notice">The messages table isn’t set up yet. An admin needs to finish setup.</div>
        ) : !me ? (
          <div className="notice">You’re not on the team roster yet. Ask an admin to add you under Team.</div>
        ) : convos.length === 0 ? (
          <p className="muted">No teammates to message yet.</p>
        ) : (
          <div className="msg-conv-list">
            {convos.map((c) => (
              <Link className="msg-conv" href={`/messages/${c.employeeId}`} key={c.employeeId}>
                <Avatar name={c.name} src={c.photoUrl} size={44} />
                <div className="msg-conv-body">
                  <div className="msg-conv-top">
                    <span className="msg-conv-name">{c.name}</span>
                    {c.unread > 0 && <span className="msg-badge">{c.unread}</span>}
                  </div>
                  <div className="msg-conv-preview">{c.lastBody ?? "Start a conversation"}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
