"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { messageReactions, messages } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";
import { putPrivate } from "@/lib/blobUpload";
import { REACTION_EMOJIS } from "@/lib/messages";

const IMG_MAX = 8 * 1024 * 1024;

export async function sendMessage(otherId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not signed in.");
  const me = await getEmployeeByEmail(session.user.email);
  if (!me) throw new Error("You’re not on the team roster yet. Ask an admin to add you.");

  const body = String(formData.get("body") ?? "").trim();
  const file = formData.get("image");
  let imageUrl: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > IMG_MAX) throw new Error("Photo must be under 8 MB.");
    imageUrl = await putPrivate("messages", file);
  }
  if (!body && !imageUrl) return; // nothing to send

  await db.insert(messages).values({ senderId: me.id, recipientId: otherId, body, imageUrl });
  revalidatePath(`/messages/${otherId}`);
  revalidatePath("/messages");
  redirect(`/messages/${otherId}`);
}

export async function toggleReaction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not signed in.");
  const me = await getEmployeeByEmail(session.user.email);
  if (!me) throw new Error("You’re not on the team roster yet.");

  const messageId = String(formData.get("messageId") ?? "");
  const emoji = String(formData.get("emoji") ?? "");
  const otherId = String(formData.get("otherId") ?? "");
  if (!messageId || !REACTION_EMOJIS.includes(emoji)) return;

  const existing = (
    await db
      .select()
      .from(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.employeeId, me.id),
          eq(messageReactions.emoji, emoji),
        ),
      )
  )[0];

  if (existing) {
    await db.delete(messageReactions).where(eq(messageReactions.id, existing.id));
  } else {
    await db.insert(messageReactions).values({ messageId, employeeId: me.id, emoji }).onConflictDoNothing();
  }
  revalidatePath(`/messages/${otherId}`);
  redirect(`/messages/${otherId}`);
}
