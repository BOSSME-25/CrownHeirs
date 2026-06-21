import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, meetings, timeOffRequests } from "@/lib/db/schema";
import type { Meeting } from "@/lib/db/schema";

export type CalendarItem = {
  kind: "meeting" | "birthday" | "timeoff";
  date: string; // YYYY-MM-DD (this year's occurrence for birthdays)
  title: string;
  time?: string | null;
  location?: string | null;
  notes?: string | null;
  url?: string | null;
  id?: string;
};

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmtShort(ymdStr: string) {
  return new Date(ymdStr + "T00:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC", month: "short", day: "numeric",
  });
}

/** Meetings + birthdays in the next `days` days, sorted chronologically. */
export async function upcomingEvents(days = 60): Promise<CalendarItem[]> {
  const today = new Date();
  const todayY = ymd(today);
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + days);
  const endY = ymd(end);

  const ms = await db
    .select()
    .from(meetings)
    .where(and(gte(meetings.meetingDate, todayY), lte(meetings.meetingDate, endY)))
    .orderBy(asc(meetings.meetingDate));

  const items: CalendarItem[] = ms.map((m) => ({
    kind: "meeting",
    id: m.id,
    date: m.meetingDate,
    title: m.title,
    time: m.startTime,
    location: m.location,
    notes: m.notes,
    url: m.meetingUrl,
  }));

  const emps = await db
    .select({ name: employees.fullName, bday: employees.birthday })
    .from(employees)
    .where(eq(employees.status, "active"));
  const yr = today.getUTCFullYear();
  for (const e of emps) {
    if (!e.bday) continue;
    const md = e.bday.slice(5); // MM-DD
    let occ = `${yr}-${md}`;
    if (occ < todayY) occ = `${yr + 1}-${md}`;
    if (occ >= todayY && occ <= endY) {
      items.push({ kind: "birthday", date: occ, title: `${e.name}’s birthday` });
    }
  }

  // Approved time off whose range overlaps the window.
  const offs = await db
    .select({
      name: employees.fullName,
      start: timeOffRequests.startDate,
      end: timeOffRequests.endDate,
    })
    .from(timeOffRequests)
    .innerJoin(employees, eq(timeOffRequests.employeeId, employees.id))
    .where(
      and(
        eq(timeOffRequests.status, "approved"),
        lte(timeOffRequests.startDate, endY),
        gte(timeOffRequests.endDate, todayY),
      ),
    );
  for (const o of offs) {
    const showDate = o.start >= todayY ? o.start : todayY;
    const range =
      o.start === o.end ? fmtShort(o.start) : `${fmtShort(o.start)} – ${fmtShort(o.end)}`;
    items.push({
      kind: "timeoff",
      date: showDate,
      title: `${o.name} off`,
      notes: range,
    });
  }

  items.sort((a, b) =>
    a.date === b.date ? (a.time ?? "").localeCompare(b.time ?? "") : a.date.localeCompare(b.date),
  );
  return items;
}

/** The soonest meeting within `days` days (for the dashboard banner). */
export async function nextMeeting(days = 7): Promise<Meeting | undefined> {
  const today = new Date();
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + days);
  const rows = await db
    .select()
    .from(meetings)
    .where(and(gte(meetings.meetingDate, ymd(today)), lte(meetings.meetingDate, ymd(end))))
    .orderBy(asc(meetings.meetingDate))
    .limit(1);
  return rows[0];
}
