"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { db } from "@/lib/db";
import { meetingNotes, noteComments } from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";
import { putPrivate } from "@/lib/blobUpload";

const MAX_BYTES = 25 * 1024 * 1024;

async function uploadFile(formData: FormData): Promise<string | undefined> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return undefined;
  if (file.size > MAX_BYTES) throw new Error("File exceeds 25 MB.");
  return putPrivate("notes", file);
}

export async function addNote(formData: FormData) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) throw new Error("Only admins can add notes.");

  const get = (k: string) => {
    const v = formData.get(k);
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? null : s;
  };
  const title = get("title");
  const kind = get("kind") === "one_on_one" ? "one_on_one" : "team";
  if (!title) throw new Error("Title is required.");
  const employeeId = kind === "one_on_one" ? get("employeeId") : null;
  if (kind === "one_on_one" && !employeeId) {
    throw new Error("Choose the employee for a 1:1 note.");
  }

  const fileUrl = await uploadFile(formData);

  await db.insert(meetingNotes).values({
    kind,
    title,
    meetingDate: get("meetingDate"),
    body: get("body"),
    fileUrl: fileUrl ?? null,
    employeeId,
    createdBy: session?.user?.email,
  });
  revalidatePath("/notes");
  redirect(`/notes?ok=${encodeURIComponent("Note posted")}`);
}

// An employee comments on their own 1:1 (or a manager on any). Keeps the
// conversation attached to the note.
export async function addNoteComment(formData: FormData) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Not signed in.");
  const noteId = String(formData.get("noteId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!noteId || !body) return;

  const note = (await db.select().from(meetingNotes).where(eq(meetingNotes.id, noteId)))[0];
  if (!note) throw new Error("Note not found.");

  const me = await getEmployeeByEmail(email);
  const admin = isAdmin(email);
  const isOwnerOfNote = !!me && note.employeeId === me.id;
  if (!admin && !isOwnerOfNote) throw new Error("You can only comment on your own 1:1 notes.");

  await db.insert(noteComments).values({
    noteId,
    authorId: me?.id ?? null,
    authorName: me?.fullName ?? email,
    body,
  });
  revalidatePath("/notes");
  redirect(`/notes?ok=${encodeURIComponent("Comment added")}`);
}

export async function deleteNote(id: string) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) throw new Error("Only admins can delete notes.");
  await db.delete(meetingNotes).where(eq(meetingNotes.id, id));
  revalidatePath("/notes");
  redirect(`/notes?ok=${encodeURIComponent("Note deleted")}`);
}
