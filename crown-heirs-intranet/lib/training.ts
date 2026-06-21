import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employees,
  quizAttempts,
  quizQuestions,
  trainingVideos,
  videoViews,
} from "@/lib/db/schema";

export const PASS_PCT = 0.8;

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

export async function getVideo(id: string) {
  const rows = await db.select().from(trainingVideos).where(eq(trainingVideos.id, id));
  return rows[0];
}

export async function listQuestions(videoId: string) {
  return db
    .select()
    .from(quizQuestions)
    .where(eq(quizQuestions.videoId, videoId))
    .orderBy(asc(quizQuestions.createdAt));
}

export async function hasWatched(videoId: string, employeeId: string): Promise<boolean> {
  const rows = await db
    .select({ id: videoViews.id })
    .from(videoViews)
    .where(and(eq(videoViews.videoId, videoId), eq(videoViews.employeeId, employeeId)));
  return rows.length > 0;
}

export async function lastAttempt(videoId: string, employeeId: string) {
  const rows = await db
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.videoId, videoId), eq(quizAttempts.employeeId, employeeId)))
    .orderBy(desc(quizAttempts.takenAt))
    .limit(1);
  return rows[0];
}

export type ViewerStatus = {
  employeeId: string;
  name: string;
  watched: boolean;
  score: number | null;
  total: number | null;
};

/** For admins: each active employee's watched status + best/last score. */
export async function viewerStatuses(videoId: string): Promise<ViewerStatus[]> {
  const roster = await db
    .select({ id: employees.id, name: employees.fullName })
    .from(employees)
    .where(eq(employees.status, "active"))
    .orderBy(asc(employees.fullName));

  const views = await db
    .select({ employeeId: videoViews.employeeId })
    .from(videoViews)
    .where(eq(videoViews.videoId, videoId));
  const watched = new Set(views.map((v) => v.employeeId));

  const attempts = await db
    .select({
      employeeId: quizAttempts.employeeId,
      score: quizAttempts.score,
      total: quizAttempts.total,
      takenAt: quizAttempts.takenAt,
    })
    .from(quizAttempts)
    .where(eq(quizAttempts.videoId, videoId))
    .orderBy(desc(quizAttempts.takenAt));
  const bestByEmployee = new Map<string, { score: number; total: number }>();
  for (const a of attempts) {
    const cur = bestByEmployee.get(a.employeeId);
    if (!cur || a.score / a.total > cur.score / cur.total) {
      bestByEmployee.set(a.employeeId, { score: a.score, total: a.total });
    }
  }

  return roster.map((r) => ({
    employeeId: r.id,
    name: r.name,
    watched: watched.has(r.id),
    score: bestByEmployee.get(r.id)?.score ?? null,
    total: bestByEmployee.get(r.id)?.total ?? null,
  }));
}
