"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { db } from "@/lib/db";
import { suggestions } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";

export async function submitSuggestion(formData: FormData) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not signed in.");

  const message = String(formData.get("message") ?? "").trim();
  if (!message) throw new Error("Please write a suggestion.");
  const anonymous = formData.get("anonymous") === "on";

  let authorName: string | null = null;
  if (!anonymous) {
    const me = await getEmployeeByEmail(session.user.email);
    authorName = me?.fullName ?? session.user.name ?? session.user.email;
  }

  await db.insert(suggestions).values({ message, anonymous, authorName });
  revalidatePath("/suggestions");
  redirect(`/suggestions?ok=${encodeURIComponent("Suggestion submitted — thank you!")}`);
}

export async function setSuggestionStatus(id: string, status: "new" | "reviewed") {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) throw new Error("Only admins can do this.");
  await db.update(suggestions).set({ status }).where(eq(suggestions.id, id));
  revalidatePath("/suggestions");
  redirect(`/suggestions?ok=${encodeURIComponent("Suggestion updated")}`);
}

export async function deleteSuggestion(id: string) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) throw new Error("Only admins can do this.");
  await db.delete(suggestions).where(eq(suggestions.id, id));
  revalidatePath("/suggestions");
  redirect(`/suggestions?ok=${encodeURIComponent("Suggestion deleted")}`);
}
