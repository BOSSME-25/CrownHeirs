import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, meetingNotes } from "@/lib/db/schema";

export async function listTeamNotes() {
  return db
    .select()
    .from(meetingNotes)
    .where(eq(meetingNotes.kind, "team"))
    .orderBy(desc(meetingNotes.meetingDate), desc(meetingNotes.createdAt));
}

export type OneOnOneNote = {
  id: string;
  title: string;
  meetingDate: string | null;
  body: string | null;
  fileUrl: string | null;
  employeeName: string | null;
  createdAt: Date | null;
};

// All 1:1 notes (admins only).
export async function listAllOneOnOne(): Promise<OneOnOneNote[]> {
  return db
    .select({
      id: meetingNotes.id,
      title: meetingNotes.title,
      meetingDate: meetingNotes.meetingDate,
      body: meetingNotes.body,
      fileUrl: meetingNotes.fileUrl,
      employeeName: employees.fullName,
      createdAt: meetingNotes.createdAt,
    })
    .from(meetingNotes)
    .leftJoin(employees, eq(meetingNotes.employeeId, employees.id))
    .where(eq(meetingNotes.kind, "one_on_one"))
    .orderBy(desc(meetingNotes.meetingDate), desc(meetingNotes.createdAt));
}

// 1:1 notes for one employee (their own).
export async function listMyOneOnOne(employeeId: string): Promise<OneOnOneNote[]> {
  return db
    .select({
      id: meetingNotes.id,
      title: meetingNotes.title,
      meetingDate: meetingNotes.meetingDate,
      body: meetingNotes.body,
      fileUrl: meetingNotes.fileUrl,
      employeeName: employees.fullName,
      createdAt: meetingNotes.createdAt,
    })
    .from(meetingNotes)
    .leftJoin(employees, eq(meetingNotes.employeeId, employees.id))
    .where(and(eq(meetingNotes.kind, "one_on_one"), eq(meetingNotes.employeeId, employeeId)))
    .orderBy(desc(meetingNotes.meetingDate), desc(meetingNotes.createdAt));
}
