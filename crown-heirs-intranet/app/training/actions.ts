"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { db } from "@/lib/db";
import {
  quizAttempts,
  quizQuestions,
  trainingVideos,
  videoViews,
} from "@/lib/db/schema";
import { getEmployeeByEmail } from "@/lib/employees";
import { listQuestions, parseYouTubeId } from "@/lib/training";

async function currentEmployee() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) throw new Error("Not signed in.");
  const employee = await getEmployeeByEmail(email);
  if (!employee) {
    throw new Error("You’re not on the team roster yet. Ask an admin to add you first.");
  }
  return employee;
}

export async function addVideo(formData: FormData) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) throw new Error("Only admins can add videos.");

  const title = String(formData.get("title") ?? "").trim();
  const url = String(formData.get("youtube") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const section = String(formData.get("section") ?? "").trim() || null;
  if (!title || !url) throw new Error("Title and YouTube link are required.");

  const youtubeId = parseYouTubeId(url);
  if (!youtubeId) {
    throw new Error("Couldn’t read that YouTube link. Paste the full video URL.");
  }

  await db.insert(trainingVideos).values({ title, youtubeId, description, section });
  revalidatePath("/training");
}

// Recategorize a video into a (possibly new) section.
export async function updateVideoSection(id: string, formData: FormData) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) throw new Error("Only admins can edit videos.");
  const section = String(formData.get("section") ?? "").trim() || null;
  await db.update(trainingVideos).set({ section }).where(eq(trainingVideos.id, id));
  revalidatePath("/training");
}

export async function deleteVideo(id: string) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) throw new Error("Only admins can remove videos.");
  await db.delete(trainingVideos).where(eq(trainingVideos.id, id));
  revalidatePath("/training");
}

// ── Watching ──

export async function markWatched(videoId: string) {
  const employee = await currentEmployee();
  await db
    .insert(videoViews)
    .values({ videoId, employeeId: employee.id })
    .onConflictDoNothing();
  revalidatePath(`/training/${videoId}`);
}

// ── Assessments ──

export async function addQuestion(videoId: string, formData: FormData) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) throw new Error("Only admins can edit assessments.");

  const prompt = String(formData.get("prompt") ?? "").trim();
  if (!prompt) throw new Error("Question text is required.");

  // Collect up to 4 options, remembering which original slot is correct.
  const correctSlot = Number(formData.get("correct"));
  const options: string[] = [];
  let correctIndex = -1;
  for (let i = 0; i < 4; i++) {
    const text = String(formData.get(`option${i}`) ?? "").trim();
    if (!text) continue;
    if (i === correctSlot) correctIndex = options.length;
    options.push(text);
  }
  if (options.length < 2) throw new Error("Add at least two answer options.");
  if (correctIndex < 0) throw new Error("Mark one of the filled options as correct.");

  await db.insert(quizQuestions).values({ videoId, prompt, options, correctIndex });
  revalidatePath(`/training/${videoId}`);
}

export async function deleteQuestion(videoId: string, questionId: string) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) throw new Error("Only admins can edit assessments.");
  await db.delete(quizQuestions).where(eq(quizQuestions.id, questionId));
  revalidatePath(`/training/${videoId}`);
}

export async function submitQuiz(videoId: string, formData: FormData) {
  const employee = await currentEmployee();
  const questions = await listQuestions(videoId);
  if (questions.length === 0) throw new Error("This video has no assessment.");

  let score = 0;
  for (const q of questions) {
    const answer = Number(formData.get(`q_${q.id}`));
    if (Number.isInteger(answer) && answer === q.correctIndex) score += 1;
  }

  await db.insert(quizAttempts).values({
    videoId,
    employeeId: employee.id,
    score,
    total: questions.length,
  });
  // Completing the assessment also counts as watching.
  await db
    .insert(videoViews)
    .values({ videoId, employeeId: employee.id })
    .onConflictDoNothing();

  revalidatePath(`/training/${videoId}`);
}
