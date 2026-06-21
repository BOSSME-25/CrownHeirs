"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { db } from "@/lib/db";
import { trainingVideos } from "@/lib/db/schema";
import { parseYouTubeId } from "@/lib/training";

export async function addVideo(formData: FormData) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) throw new Error("Only admins can add videos.");

  const title = String(formData.get("title") ?? "").trim();
  const url = String(formData.get("youtube") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!title || !url) throw new Error("Title and YouTube link are required.");

  const youtubeId = parseYouTubeId(url);
  if (!youtubeId) {
    throw new Error("Couldn’t read that YouTube link. Paste the full video URL.");
  }

  await db.insert(trainingVideos).values({ title, youtubeId, description });
  revalidatePath("/training");
}

export async function deleteVideo(id: string) {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) throw new Error("Only admins can remove videos.");
  await db.delete(trainingVideos).where(eq(trainingVideos.id, id));
  revalidatePath("/training");
}
