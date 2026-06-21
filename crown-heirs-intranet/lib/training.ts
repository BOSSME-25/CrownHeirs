import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  employees,
  quizAttempts,
  quizQuestions,
  trainingVideos,
  videoViews,
} from "@/lib/db/schema";
import type { TrainingVideo } from "@/lib/db/schema";

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

export async function getWatchedAt(videoId: string, employeeId: string) {
  const rows = await db
    .select({ w: videoViews.watchedAt })
    .from(videoViews)
    .where(and(eq(videoViews.videoId, videoId), eq(videoViews.employeeId, employeeId)));
  return rows[0]?.w;
}

// ── Required training / completion ──

export async function requiredVideos() {
  return db
    .select()
    .from(trainingVideos)
    .where(eq(trainingVideos.required, true))
    .orderBy(asc(trainingVideos.dueDate));
}

function todayYMD() {
  return new Date().toISOString().slice(0, 10);
}

async function questionCounts(ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!ids.length) return map;
  const rows = await db
    .select({ videoId: quizQuestions.videoId })
    .from(quizQuestions)
    .where(inArray(quizQuestions.videoId, ids));
  for (const r of rows) map.set(r.videoId, (map.get(r.videoId) ?? 0) + 1);
  return map;
}

export type MyRequired = {
  video: TrainingVideo;
  watched: boolean;
  hasQuiz: boolean;
  best: { score: number; total: number } | null;
  complete: boolean;
  overdue: boolean;
};

export async function myRequiredStatus(employeeId: string): Promise<MyRequired[]> {
  const reqs = await requiredVideos();
  const ids = reqs.map((r) => r.id);
  if (!ids.length) return [];

  const qCount = await questionCounts(ids);
  const views = await db
    .select({ videoId: videoViews.videoId })
    .from(videoViews)
    .where(and(inArray(videoViews.videoId, ids), eq(videoViews.employeeId, employeeId)));
  const watchedSet = new Set(views.map((v) => v.videoId));

  const attempts = await db
    .select({ videoId: quizAttempts.videoId, score: quizAttempts.score, total: quizAttempts.total })
    .from(quizAttempts)
    .where(and(inArray(quizAttempts.videoId, ids), eq(quizAttempts.employeeId, employeeId)));
  const best = new Map<string, { score: number; total: number }>();
  for (const a of attempts) {
    const c = best.get(a.videoId);
    if (!c || a.score / a.total > c.score / c.total) best.set(a.videoId, { score: a.score, total: a.total });
  }

  const today = todayYMD();
  return reqs.map((v) => {
    const hasQuiz = (qCount.get(v.id) ?? 0) > 0;
    const watched = watchedSet.has(v.id);
    const b = best.get(v.id) ?? null;
    const passed = hasQuiz ? (b ? b.score / b.total >= PASS_PCT : false) : true;
    const complete = watched && passed;
    const overdue = !complete && !!v.dueDate && v.dueDate < today;
    return { video: v, watched, hasQuiz, best: b, complete, overdue };
  });
}

export type DashVideo = {
  video: TrainingVideo;
  rows: { employeeId: string; name: string; complete: boolean }[];
  completeCount: number;
  total: number;
  overdue: boolean;
};

export async function requiredDashboard(): Promise<DashVideo[]> {
  const reqs = await requiredVideos();
  const ids = reqs.map((r) => r.id);
  if (!ids.length) return [];

  const roster = await db
    .select({ id: employees.id, name: employees.fullName })
    .from(employees)
    .where(eq(employees.status, "active"))
    .orderBy(asc(employees.fullName));
  const qCount = await questionCounts(ids);

  const views = await db
    .select({ videoId: videoViews.videoId, employeeId: videoViews.employeeId })
    .from(videoViews)
    .where(inArray(videoViews.videoId, ids));
  const watchedSet = new Set(views.map((v) => `${v.videoId}|${v.employeeId}`));

  const attempts = await db
    .select({ videoId: quizAttempts.videoId, employeeId: quizAttempts.employeeId, score: quizAttempts.score, total: quizAttempts.total })
    .from(quizAttempts)
    .where(inArray(quizAttempts.videoId, ids));
  const best = new Map<string, { score: number; total: number }>();
  for (const a of attempts) {
    const k = `${a.videoId}|${a.employeeId}`;
    const c = best.get(k);
    if (!c || a.score / a.total > c.score / c.total) best.set(k, { score: a.score, total: a.total });
  }

  const today = todayYMD();
  return reqs.map((v) => {
    const hasQuiz = (qCount.get(v.id) ?? 0) > 0;
    const rows = roster.map((r) => {
      const watched = watchedSet.has(`${v.id}|${r.id}`);
      const b = best.get(`${v.id}|${r.id}`);
      const passed = hasQuiz ? (b ? b.score / b.total >= PASS_PCT : false) : true;
      return { employeeId: r.id, name: r.name, complete: watched && passed };
    });
    const completeCount = rows.filter((r) => r.complete).length;
    const overdue = !!v.dueDate && v.dueDate < today && completeCount < rows.length;
    return { video: v, rows, completeCount, total: rows.length, overdue };
  });
}
