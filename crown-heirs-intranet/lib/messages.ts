import "server-only";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, messages } from "@/lib/db/schema";

export type Conversation = {
  employeeId: string;
  name: string;
  photoUrl: string | null;
  lastBody: string | null;
  lastAt: Date | null;
  unread: number;
};

/** Active teammates (excluding me) with last-message preview + unread count. */
export async function conversationsFor(meId: string): Promise<Conversation[]> {
  const roster = await db
    .select({ id: employees.id, name: employees.fullName, photoUrl: employees.photoUrl })
    .from(employees)
    .where(eq(employees.status, "active"))
    .orderBy(asc(employees.fullName));

  const mine = await db
    .select()
    .from(messages)
    .where(or(eq(messages.senderId, meId), eq(messages.recipientId, meId)));

  const lastByOther = new Map<string, { body: string; at: Date | null }>();
  const unreadByOther = new Map<string, number>();
  for (const m of mine) {
    const other = m.senderId === meId ? m.recipientId : m.senderId;
    const at = m.createdAt ? new Date(m.createdAt) : null;
    const prev = lastByOther.get(other);
    if (!prev || (at && prev.at && at > prev.at) || (at && !prev.at)) {
      lastByOther.set(other, { body: m.body, at });
    }
    if (m.recipientId === meId && !m.readAt) {
      unreadByOther.set(other, (unreadByOther.get(other) ?? 0) + 1);
    }
  }

  return roster
    .filter((r) => r.id !== meId)
    .map((r) => ({
      employeeId: r.id,
      name: r.name,
      photoUrl: r.photoUrl,
      lastBody: lastByOther.get(r.id)?.body ?? null,
      lastAt: lastByOther.get(r.id)?.at ?? null,
      unread: unreadByOther.get(r.id) ?? 0,
    }))
    .sort((a, b) => {
      if (a.lastAt && b.lastAt) return b.lastAt.getTime() - a.lastAt.getTime();
      if (a.lastAt) return -1;
      if (b.lastAt) return 1;
      return a.name.localeCompare(b.name);
    });
}

export async function threadBetween(meId: string, otherId: string) {
  return db
    .select()
    .from(messages)
    .where(
      or(
        and(eq(messages.senderId, meId), eq(messages.recipientId, otherId)),
        and(eq(messages.senderId, otherId), eq(messages.recipientId, meId)),
      ),
    )
    .orderBy(asc(messages.createdAt));
}

export async function unreadTotal(meId: string): Promise<number> {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.recipientId, meId), isNull(messages.readAt)));
  return rows.length;
}

/** Mark all messages from `otherId` to me as read. */
export async function markRead(meId: string, otherId: string) {
  await db
    .update(messages)
    .set({ readAt: new Date() })
    .where(
      and(eq(messages.recipientId, meId), eq(messages.senderId, otherId), isNull(messages.readAt)),
    );
}
