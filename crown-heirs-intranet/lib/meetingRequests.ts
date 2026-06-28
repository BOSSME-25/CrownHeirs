import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, meetingRequests } from "@/lib/db/schema";
import type { MeetingRequest } from "@/lib/db/schema";
import { adminEmails } from "@/lib/email";

// Owners + directors + managers — who hears about meeting requests.
export async function managementEmails(): Promise<string[]> {
  const rows = await db
    .select({ email: employees.email, role: employees.role, status: employees.status })
    .from(employees);
  const mgmt = rows
    .filter((r) => r.status === "active" && (r.role === "director" || r.role === "admin" || r.role === "manager"))
    .map((r) => r.email)
    .filter(Boolean) as string[];
  return [...new Set([...adminEmails(), ...mgmt])];
}

export async function listPendingRequests(): Promise<MeetingRequest[]> {
  return db
    .select()
    .from(meetingRequests)
    .where(eq(meetingRequests.status, "pending"))
    .orderBy(asc(meetingRequests.createdAt));
}

export async function listMyRequests(employeeId: string): Promise<MeetingRequest[]> {
  return db
    .select()
    .from(meetingRequests)
    .where(eq(meetingRequests.requesterId, employeeId))
    .orderBy(asc(meetingRequests.createdAt));
}
