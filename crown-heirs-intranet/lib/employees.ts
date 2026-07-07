import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, type Employee } from "@/lib/db/schema";

export async function listEmployees(): Promise<Employee[]> {
  return db.select().from(employees).orderBy(asc(employees.fullName));
}

export async function getEmployee(id: string): Promise<Employee | undefined> {
  const rows = await db.select().from(employees).where(eq(employees.id, id));
  return rows[0];
}

export async function getEmployeeByEmail(email: string): Promise<Employee | undefined> {
  const rows = await db
    .select()
    .from(employees)
    .where(eq(employees.email, email.toLowerCase()));
  return rows[0];
}

// Distinct job titles among active staff (for targeting required training).
export async function jobTitles(): Promise<string[]> {
  const rows = await db
    .select({ t: employees.jobTitle })
    .from(employees)
    .where(eq(employees.status, "active"));
  const set = new Set<string>();
  for (const r of rows) if (r.t && r.t.trim()) set.add(r.t.trim());
  return [...set].sort();
}

export const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contractor", label: "Contractor" },
];

export const WAGE_TYPES = [
  { value: "hourly", label: "Hourly" },
  { value: "salary", label: "Salary" },
  { value: "commission", label: "Commission" },
];

export const ROLES = [
  { value: "staff", label: "Staff" },
  { value: "manager", label: "Manager" },
  { value: "director", label: "Director" },
  { value: "admin", label: "Admin" },
];

export function labelFor(
  list: { value: string; label: string }[],
  value: string | null,
): string {
  if (!value) return "—";
  return list.find((i) => i.value === value)?.label ?? value;
}
