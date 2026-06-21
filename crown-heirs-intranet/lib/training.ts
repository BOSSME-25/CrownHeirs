import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { trainingVideos } from "@/lib/db/schema";

/**
 * Pull the 11-character video ID out of any common YouTube link:
 * watch?v=, youtu.be/, /embed/, /shorts/, or a bare ID.
 */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return id || null;
    }
    if (host.endsWith("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => p === "embed" || p === "shorts" || p === "v");
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
    }
  } catch {
    // not a URL
  }
  return null;
}

export async function listVideos() {
  return db.select().from(trainingVideos).orderBy(asc(trainingVideos.createdAt));
}
