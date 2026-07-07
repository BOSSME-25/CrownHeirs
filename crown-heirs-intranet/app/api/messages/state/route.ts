import { auth } from "@/auth";
import { getEmployeeByEmail } from "@/lib/employees";
import { conversationsFor } from "@/lib/messages";

export const dynamic = "force-dynamic";

// Powers the site-wide messages dock: who I am, my conversations, unread total.
export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return Response.json({ me: null });
  try {
    const me = await getEmployeeByEmail(email);
    if (!me) return Response.json({ me: null });
    const conversations = await conversationsFor(me.id);
    const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);
    return Response.json({ me: { id: me.id, name: me.fullName }, totalUnread, conversations });
  } catch {
    return Response.json({ me: null });
  }
}
