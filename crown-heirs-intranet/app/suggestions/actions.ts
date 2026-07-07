"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getAccess } from "@/lib/perms";
import { db } from "@/lib/db";
import { employees, suggestions } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";
import { adminEmails, emailLayout, sendEmail } from "@/lib/email";

async function requireManage() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canManageTeam) throw new Error("Only directors and owners can do this.");
}

// Suggestions are routed to directors and owners (CEO/COO).
async function directorAndOwnerEmails(): Promise<string[]> {
  const owners = adminEmails();
  let directors: string[] = [];
  try {
    const rows = await db
      .select({ email: employees.email, role: employees.role, status: employees.status })
      .from(employees);
    directors = rows
      .filter(
        (r) =>
          (r.role === "director" || r.role === "admin") &&
          r.status === "active" &&
          r.email &&
          !r.email.endsWith("@crownheirs.invalid"),
      )
      .map((r) => r.email);
  } catch {
    // employees table not ready — fall back to owners only
  }
  return [...new Set([...owners, ...directors])];
}

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

  await sendEmail({
    to: await directorAndOwnerEmails(),
    subject: "New suggestion submitted",
    html: emailLayout(
      "New suggestion",
      `${anonymous ? "An anonymous team member" : authorName} submitted a suggestion:<br><br>“${message}”`,
      "/suggestions",
    ),
  });

  revalidatePath("/suggestions");
  redirect(`/suggestions?ok=${encodeURIComponent("Suggestion submitted — thank you!")}`);
}

export async function setSuggestionStatus(id: string, status: "new" | "reviewed") {
  await requireManage();
  await db.update(suggestions).set({ status }).where(eq(suggestions.id, id));
  revalidatePath("/suggestions");
  redirect(`/suggestions?ok=${encodeURIComponent("Suggestion updated")}`);
}

export async function deleteSuggestion(id: string) {
  await requireManage();
  await db.delete(suggestions).where(eq(suggestions.id, id));
  revalidatePath("/suggestions");
  redirect(`/suggestions?ok=${encodeURIComponent("Suggestion deleted")}`);
}
