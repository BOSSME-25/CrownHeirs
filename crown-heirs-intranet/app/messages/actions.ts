"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";

export async function sendMessage(otherId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not signed in.");
  const me = await getEmployeeByEmail(session.user.email);
  if (!me) throw new Error("You’re not on the team roster yet. Ask an admin to add you.");

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  await db.insert(messages).values({ senderId: me.id, recipientId: otherId, body });
  revalidatePath(`/messages/${otherId}`);
  revalidatePath("/messages");
}
