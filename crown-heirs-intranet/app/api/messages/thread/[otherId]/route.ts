import { auth } from "@/auth";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";
import { markRead, threadBetween } from "@/lib/messages";

export const dynamic = "force-dynamic";

async function me() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return null;
  return getEmployeeByEmail(email);
}

// Load a thread (and mark the other person's messages read).
export async function GET(_req: Request, { params }: { params: Promise<{ otherId: string }> }) {
  const { otherId } = await params;
  const m = await me();
  if (!m) return new Response("Unauthorized", { status: 401 });
  await markRead(m.id, otherId);
  const rows = await threadBetween(m.id, otherId);
  return Response.json({
    meId: m.id,
    messages: rows.map((r) => ({ id: r.id, mine: r.senderId === m.id, body: r.body, at: r.createdAt })),
  });
}

// Send a message in this thread.
export async function POST(req: Request, { params }: { params: Promise<{ otherId: string }> }) {
  const { otherId } = await params;
  const m = await me();
  if (!m) return new Response("Unauthorized", { status: 401 });
  const { body } = (await req.json().catch(() => ({}))) as { body?: string };
  const text = (body ?? "").trim();
  if (!text) return new Response("Empty message", { status: 400 });
  await db.insert(messages).values({ senderId: m.id, recipientId: otherId, body: text });
  return Response.json({ ok: true });
}
