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

// ───────────────────────────────────────────────
// Shift duties — a checklist of tasks for a shift.
// The person working (or an admin) checks them off.
// ───────────────────────────────────────────────
export const shiftDuties = pgTable("shift_duties", {
  id: uuid("id").defaultRandom().primaryKey(),
  shiftId: uuid("shift_id")
    .notNull()
    .references(() => shifts.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  done: boolean("done").notNull().default(false),
  sortOrder: numeric("sort_order").default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type ShiftDuty = typeof shiftDuties.$inferSelect;

// ───────────────────────────────────────────────
// Time-off requests — staff request, admins decide.
// ───────────────────────────────────────────────
export const timeOffRequests = pgTable("time_off_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  type: text("type"), // vacation | sick | personal | unpaid
  note: text("note"),
  status: text("status").notNull().default("pending"), // pending | approved | denied
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type TimeOffRequest = typeof timeOffRequests.$inferSelect;

// ───────────────────────────────────────────────
// Shift swap requests — staff ask to hand off a
// shift; an admin approves (and reassigns) or denies.
// ───────────────────────────────────────────────
export const swapRequests = pgTable("swap_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  shiftId: uuid("shift_id")
    .notNull()
    .references(() => shifts.id, { onDelete: "cascade" }),
  requestedById: uuid("requested_by_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  targetEmployeeId: uuid("target_employee_id").references(() => employees.id, {
    onDelete: "set null",
  }),
  reason: text("reason"),
  status: text("status").notNull().default("pending"), // pending | approved | denied
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type SwapRequest = typeof swapRequests.$inferSelect;
