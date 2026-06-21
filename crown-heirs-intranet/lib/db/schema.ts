import {
  pgTable,
  uuid,
  text,
  numeric,
  date,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";

// ───────────────────────────────────────────────
// Employees — the team roster. Everything else
// (schedules, time clock, time-off) hangs off this.
// ───────────────────────────────────────────────
export const employees = pgTable("employees", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Links to the person's Google login email.
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  jobTitle: text("job_title"),
  // 'full_time' | 'part_time' | 'contractor'
  employmentType: text("employment_type"),
  // 'active' | 'inactive'
  status: text("status").notNull().default("active"),
  // App role: 'admin' | 'manager' | 'staff'
  role: text("role").notNull().default("staff"),
  startDate: date("start_date"),
  // Sensitive — only admins ever see these.
  wage: numeric("wage", { precision: 10, scale: 2 }),
  // 'hourly' | 'salary' | 'commission'
  wageType: text("wage_type"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type Employee = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;

// ───────────────────────────────────────────────
// Shifts — the weekly schedule. Each shift assigns
// one employee to a time block on a given day.
// ───────────────────────────────────────────────
export const shifts = pgTable("shifts", {
  id: uuid("id").defaultRandom().primaryKey(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  shiftDate: date("shift_date").notNull(),
  startTime: text("start_time").notNull(), // "HH:MM"
  endTime: text("end_time").notNull(), // "HH:MM"
  position: text("position"),
  notes: text("notes"),
  // Draft shifts are visible to admins only until the week is published.
  published: boolean("published").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type Shift = typeof shifts.$inferSelect;
export type NewShift = typeof shifts.$inferInsert;
