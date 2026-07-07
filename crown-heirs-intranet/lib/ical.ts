import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, meetings, shifts, timeOffRequests } from "@/lib/db/schema";

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}
function pad(n: number) {
  return String(n).padStart(2, "0");
}
function dateOnly(s: string) {
  return s.replace(/-/g, "");
}
function dtLocal(dateYMD: string, hhmm: string) {
  // Floating local time (no Z) — calendars show it in the viewer's zone.
  return dateYMD.replace(/-/g, "") + "T" + hhmm.replace(":", "") + "00";
}
function addOneDay(dateYMD: string) {
  const d = new Date(dateYMD + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return ymd(d);
}
function esc(s: string) {
  return s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
}

export async function getEmployeeByCalendarToken(token: string) {
  const rows = await db.select().from(employees).where(eq(employees.calendarToken, token));
  return rows[0];
}

export async function buildIcs(employeeId: string, employeeName: string): Promise<string> {
  const today = new Date();
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 14);
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + 120);
  const s0 = ymd(start);
  const s1 = ymd(end);

  const myShifts = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.employeeId, employeeId), eq(shifts.published, true), gte(shifts.shiftDate, s0), lte(shifts.shiftDate, s1)))
    .orderBy(asc(shifts.shiftDate));
  const ms = await db
    .select()
    .from(meetings)
    .where(and(gte(meetings.meetingDate, s0), lte(meetings.meetingDate, s1)));
  const offs = await db
    .select()
    .from(timeOffRequests)
    .where(and(eq(timeOffRequests.employeeId, employeeId), eq(timeOffRequests.status, "approved"), gte(timeOffRequests.endDate, s0), lte(timeOffRequests.startDate, s1)));

  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Crown Heirs//Team Hub//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:Crown Heirs — ${esc(employeeName)}`,
  ];

  function ev(uid: string, summary: string, o: { start?: string; end?: string; date?: string; allDayEnd?: string }) {
    lines.push("BEGIN:VEVENT", `UID:${uid}@crownheirs`, `DTSTAMP:${stamp}`);
    if (o.start && o.end) {
      lines.push(`DTSTART:${o.start}`, `DTEND:${o.end}`);
    } else if (o.date) {
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(o.date)}`);
      if (o.allDayEnd) lines.push(`DTEND;VALUE=DATE:${dateOnly(o.allDayEnd)}`);
    }
    lines.push(`SUMMARY:${esc(summary)}`, "END:VEVENT");
  }

  for (const sh of myShifts) {
    ev(`shift-${sh.id}`, `Shift${sh.position ? ` · ${sh.position}` : ""}`, {
      start: dtLocal(sh.shiftDate, sh.startTime),
      end: dtLocal(sh.shiftDate, sh.endTime),
    });
  }
  for (const m of ms) {
    if (m.startTime) {
      const [h, mi] = m.startTime.split(":").map(Number);
      const endDt = dtLocal(m.meetingDate, `${pad((h + 1) % 24)}:${pad(mi)}`);
      ev(`mtg-${m.id}`, m.title, { start: dtLocal(m.meetingDate, m.startTime), end: endDt });
    } else {
      ev(`mtg-${m.id}`, m.title, { date: m.meetingDate, allDayEnd: addOneDay(m.meetingDate) });
    }
  }
  for (const o of offs) {
    ev(`off-${o.id}`, "Time off", { date: o.startDate, allDayEnd: addOneDay(o.endDate) });
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
