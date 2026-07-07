import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  jsonb,
  date,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";

// ───────────────────────────────────────────────
// Organizations — the top-level tenant. Each salon
// business that licenses the platform is one org.
// (Crown Heirs is org #1.)
// ───────────────────────────────────────────────
export const organizations = pgTable("organizations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  // 'trial' | 'active' | 'suspended'
  status: text("status").notNull().default("active"),
  // Per-tenant config (Square creds, branding, etc.) lands here in Phase 2.
  settings: jsonb("settings"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ───────────────────────────────────────────────
// Locations — a physical salon within an org. Used
// to scope schedules, staff, and KPIs per site.
// ───────────────────────────────────────────────
export const locations = pgTable("locations", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  squareLocationId: text("square_location_id"),
  timezone: text("timezone").default("America/Phoenix"),
  address: text("address"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type Organization = typeof organizations.$inferSelect;
export type Location = typeof locations.$inferSelect;

// ───────────────────────────────────────────────
// Employees — the team roster. Everything else
// (schedules, time clock, time-off) hangs off this.
// ───────────────────────────────────────────────
export const employees = pgTable("employees", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Tenant + home location (nullable during rollout; backfilled to org #1).
  orgId: uuid("org_id"),
  locationId: uuid("location_id"),
  // Links to the person's Google login email.
  email: text("email").notNull().unique(),
  // Personal email (from Homebase/Square import); not the login.
  personalEmail: text("personal_email"),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  photoUrl: text("photo_url"),
  birthday: date("birthday"),
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
  // Social "about me" — shown to the whole team.
  bio: text("bio"),
  whyCrownHeirs: text("why_crown_heirs"),
  fiveYearPlan: text("five_year_plan"),
  favoriteAway: text("favorite_away"),
  // Secret token for the private calendar (.ics) subscription feed.
  calendarToken: text("calendar_token"),
  // Links this employee to their Square team member, for personal KPIs.
  squareTeamMemberId: text("square_team_member_id"),
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
  orgId: uuid("org_id"),
  locationId: uuid("location_id"),
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

// ───────────────────────────────────────────────
// Training videos — embedded YouTube videos for the
// Training section (and a future education platform).
// ───────────────────────────────────────────────
export const trainingVideos = pgTable("training_videos", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  youtubeId: text("youtube_id").notNull(),
  description: text("description"),
  section: text("section"),
  required: boolean("required").notNull().default(false),
  dueDate: date("due_date"),
  // Job titles this is required for. Empty/null = required for everyone.
  requiredRoles: jsonb("required_roles").$type<string[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type TrainingVideo = typeof trainingVideos.$inferSelect;

// Who has watched a training video (self-marked or via completing a quiz).
export const videoViews = pgTable("video_views", {
  id: uuid("id").defaultRandom().primaryKey(),
  videoId: uuid("video_id")
    .notNull()
    .references(() => trainingVideos.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  watchedAt: timestamp("watched_at", { withTimezone: true }).defaultNow(),
});

// Assessment questions attached to a training video (multiple choice).
export const quizQuestions = pgTable("quiz_questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  videoId: uuid("video_id")
    .notNull()
    .references(() => trainingVideos.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  options: jsonb("options").$type<string[]>().notNull(),
  correctIndex: integer("correct_index").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type QuizQuestion = typeof quizQuestions.$inferSelect;

// A staffer's assessment attempt for a video.
export const quizAttempts = pgTable("quiz_attempts", {
  id: uuid("id").defaultRandom().primaryKey(),
  videoId: uuid("video_id")
    .notNull()
    .references(() => trainingVideos.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),
  total: integer("total").notNull(),
  takenAt: timestamp("taken_at", { withTimezone: true }).defaultNow(),
});

export type QuizAttempt = typeof quizAttempts.$inferSelect;

// ───────────────────────────────────────────────
// Meetings / events — powers the team calendar.
// ───────────────────────────────────────────────
export const meetings = pgTable("meetings", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  locationId: uuid("location_id"),
  title: text("title").notNull(),
  meetingDate: date("meeting_date").notNull(),
  startTime: text("start_time"), // "HH:MM"
  location: text("location"),
  meetingUrl: text("meeting_url"), // video link (Meet/Zoom/etc.)
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type Meeting = typeof meetings.$inferSelect;

// ───────────────────────────────────────────────
// Suggestion box — staff submit ideas to management,
// optionally anonymously.
// ───────────────────────────────────────────────
export const suggestions = pgTable("suggestions", {
  id: uuid("id").defaultRandom().primaryKey(),
  message: text("message").notNull(),
  anonymous: boolean("anonymous").notNull().default(false),
  authorName: text("author_name"), // null when anonymous
  status: text("status").notNull().default("new"), // new | reviewed
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type Suggestion = typeof suggestions.$inferSelect;

// ───────────────────────────────────────────────
// Meeting notes — team-meeting notes (visible to all)
// and 1:1 notes (visible to management + that employee).
// ───────────────────────────────────────────────
export const meetingNotes = pgTable("meeting_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: text("kind").notNull().default("team"), // 'team' | 'one_on_one'
  title: text("title").notNull(),
  meetingDate: date("meeting_date"),
  body: text("body"),
  fileUrl: text("file_url"),
  // For 1:1 notes: the employee the meeting was with.
  employeeId: uuid("employee_id").references(() => employees.id, { onDelete: "set null" }),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type MeetingNote = typeof meetingNotes.$inferSelect;

// ───────────────────────────────────────────────
// Direct messages between two team members.
// ───────────────────────────────────────────────
export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  senderId: uuid("sender_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  recipientId: uuid("recipient_id")
    .notNull()
    .references(() => employees.id, { onDelete: "cascade" }),
  body: text("body").notNull().default(""),
  // Optional photo attachment (proxy URL via /api/blob).
  imageUrl: text("image_url"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type Message = typeof messages.$inferSelect;

// 👍/❤️ reactions on a message. One row per (message, person, emoji).
export const messageReactions = pgTable("message_reactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  emoji: text("emoji").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type MessageReaction = typeof messageReactions.$inferSelect;

// Comments on meeting/1:1 notes — lets employees respond to their 1:1s.
export const noteComments = pgTable("note_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  noteId: uuid("note_id").notNull().references(() => meetingNotes.id, { onDelete: "cascade" }),
  authorId: uuid("author_id"),
  authorName: text("author_name"),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type NoteComment = typeof noteComments.$inferSelect;

// A stylist's request for a 1:1 or meeting; management schedules or declines it.
export const meetingRequests = pgTable("meeting_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  requesterId: uuid("requester_id"),
  requesterName: text("requester_name"),
  requesterEmail: text("requester_email"),
  // 'one_on_one' | 'meeting'
  kind: text("kind").notNull().default("one_on_one"),
  preferredDate: date("preferred_date"),
  preferredTime: text("preferred_time"),
  note: text("note"),
  // 'pending' | 'scheduled' | 'declined'
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type MeetingRequest = typeof meetingRequests.$inferSelect;

// ───────────────────────────────────────────────
// Policy acknowledgments — "I've read & agree", with
// a dated record per employee.
// ───────────────────────────────────────────────
export const policies = pgTable("policies", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  title: text("title").notNull(),
  body: text("body"),
  fileUrl: text("file_url"),
  // A short tag for grouping (e.g. "handbook", "policy").
  category: text("category").notNull().default("policy"),
  // Bumped each time the document is "pushed out" anew — everyone must re-sign.
  version: integer("version").notNull().default(1),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
// One row per (policy, employee) — the person's sign-off status for the
// CURRENT version. Two steps: the employee acknowledges, then a different
// manager confirms (checks and balances).
export const policyAcks = pgTable("policy_acks", {
  id: uuid("id").defaultRandom().primaryKey(),
  policyId: uuid("policy_id").notNull().references(() => policies.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  // Which version this row reflects (re-set when the policy is re-pushed).
  version: integer("version").notNull().default(1),
  // Null until the employee reads & signs.
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  // Second step: a manager confirms (must differ from the employee).
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  // Throttles reminder emails.
  lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
});
export type Policy = typeof policies.$inferSelect;
export type PolicyAck = typeof policyAcks.$inferSelect;

// ───────────────────────────────────────────────
// Onboarding — a checklist template per org, with
// per-employee completion.
// ───────────────────────────────────────────────
export const onboardingTasks = pgTable("onboarding_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  title: text("title").notNull(),
  description: text("description"),
  sortOrder: numeric("sort_order").default("0"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export const onboardingProgress = pgTable("onboarding_progress", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").notNull().references(() => onboardingTasks.id, { onDelete: "cascade" }),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  done: boolean("done").notNull().default(false),
  doneAt: timestamp("done_at", { withTimezone: true }),
});
export type OnboardingTask = typeof onboardingTasks.$inferSelect;

// ───────────────────────────────────────────────
// Performance reviews — written by a manager/director,
// shared with the employee when ready.
// ───────────────────────────────────────────────
export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  reviewerEmail: text("reviewer_email"),
  periodLabel: text("period_label"),
  reviewDate: date("review_date"),
  rating: integer("rating"),
  strengths: text("strengths"),
  growth: text("growth"),
  goals: text("goals"),
  // 'draft' | 'shared'
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
export type Review = typeof reviews.$inferSelect;

// ───────────────────────────────────────────────
// Audit log — who changed what, when.
// ───────────────────────────────────────────────
export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  actorEmail: text("actor_email"),
  action: text("action").notNull(),
  entity: text("entity"),
  entityId: text("entity_id"),
  detail: text("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type AuditEntry = typeof auditLog.$inferSelect;

// ───────────────────────────────────────────────
// Compliance Center — employer + Board obligations
// tracked by level (federal / state / board), with
// evidence, due dates, and (phase 2) attestations.
// ───────────────────────────────────────────────
export const complianceItems = pgTable("compliance_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  // 'federal' | 'state' | 'board'
  level: text("level").notNull().default("federal"),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),
  // 'once' | 'monthly' | 'quarterly' | 'annual' | 'biennial'
  cadence: text("cadence").notNull().default("annual"),
  // Manager's assessment: 'compliant' | 'attention' | 'na'. Overdue/due-soon
  // are derived from dueAt.
  status: text("status").notNull().default("attention"),
  responsibleEmail: text("responsible_email"),
  dueAt: date("due_at"),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
  sortOrder: integer("sort_order").notNull().default(0),
  // Starter items ship flagged so leadership verifies them with counsel/Board.
  needsVerification: boolean("needs_verification").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
export type ComplianceItem = typeof complianceItems.$inferSelect;

export const complianceEvidence = pgTable("compliance_evidence", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  itemId: uuid("item_id").notNull().references(() => complianceItems.id, { onDelete: "cascade" }),
  // 'note' | 'link' | 'file'
  kind: text("kind").notNull().default("note"),
  label: text("label"),
  url: text("url"),
  addedBy: text("added_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type ComplianceEvidence = typeof complianceEvidence.$inferSelect;

// Phase 2 — periodic two-person attestation that the register is accurate.
export const complianceAttestations = pgTable("compliance_attestations", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  periodLabel: text("period_label"),
  attestedBy: text("attested_by"),
  attestedAt: timestamp("attested_at", { withTimezone: true }),
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  note: text("note"),
  // Snapshot of the register's state at attestation time (JSON).
  snapshot: jsonb("snapshot"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type ComplianceAttestation = typeof complianceAttestations.$inferSelect;

// ───────────────────────────────────────────────
// Time clock — punch in/out, the basis for hours,
// overtime, and payroll export.
// ───────────────────────────────────────────────
export const timeEntries = pgTable("time_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  locationId: uuid("location_id"),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  clockIn: timestamp("clock_in", { withTimezone: true }).notNull(),
  clockOut: timestamp("clock_out", { withTimezone: true }),
  breakMinutes: integer("break_minutes").notNull().default(0),
  note: text("note"),
  // Set when a manager creates/corrects an entry by hand.
  editedBy: text("edited_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type TimeEntry = typeof timeEntries.$inferSelect;

// ───────────────────────────────────────────────
// PTO ledger — running balance of paid time off.
// Positive hours = accrual/grant, negative = usage.
// Balance for an employee = sum of their entries.
// ───────────────────────────────────────────────
export const ptoLedger = pgTable("pto_ledger", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  hours: numeric("hours").notNull(),
  // 'grant' | 'accrual' | 'usage' | 'adjustment'
  kind: text("kind").notNull().default("adjustment"),
  note: text("note"),
  effectiveDate: date("effective_date"),
  // Links a usage entry to the approved time-off request that created it.
  requestId: uuid("request_id"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type PtoEntry = typeof ptoLedger.$inferSelect;

// ───────────────────────────────────────────────
// Inventory — vendors, items (retail + back bar),
// and a stock-movement ledger (receive / count /
// adjust). On-hand is stored on the item and kept
// in sync as movements are recorded.
// ───────────────────────────────────────────────
export const vendors = pgTable("vendors", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  accountNumber: text("account_number"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type Vendor = typeof vendors.$inferSelect;

export const inventoryItems = pgTable("inventory_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  locationId: uuid("location_id"),
  vendorId: uuid("vendor_id"),
  name: text("name").notNull(),
  brand: text("brand"),
  // 'retail' | 'backbar' | 'color' | 'supplies'
  category: text("category").notNull().default("retail"),
  sku: text("sku"),
  size: text("size"),
  unit: text("unit"),
  cost: numeric("cost"),
  retailPrice: numeric("retail_price"),
  onHand: numeric("on_hand").notNull().default("0"),
  reorderPoint: numeric("reorder_point").notNull().default("0"),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
export type InventoryItem = typeof inventoryItems.$inferSelect;

export const inventoryTxns = pgTable("inventory_txns", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  itemId: uuid("item_id").notNull().references(() => inventoryItems.id, { onDelete: "cascade" }),
  delta: numeric("delta").notNull(),
  // 'receive' | 'count' | 'adjust' | 'usage' | 'sale' | 'waste'
  reason: text("reason").notNull().default("adjust"),
  note: text("note"),
  unitCost: numeric("unit_cost"),
  actorEmail: text("actor_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type InventoryTxn = typeof inventoryTxns.$inferSelect;

// ───────────────────────────────────────────────
// Team Shop — employee-facing storefront for scrubs
// & merch. Products have one or more size variants,
// each with its own stock. Orders email the owners/
// directors and export to CSV.
// ───────────────────────────────────────────────
export const shopProducts = pgTable("shop_products", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  name: text("name").notNull(),
  description: text("description"),
  // 'scrubs' | 'apparel' | 'merch' | 'other'
  category: text("category").notNull().default("merch"),
  // 'tracked' (limited by size stock) | 'made_to_order' (no stock kept)
  stockMode: text("stock_mode").notNull().default("tracked"),
  price: numeric("price"),
  // Either an external link (imageUrl) or an uploaded blob (imagePathname,
  // served through /api/shop/image).
  imageUrl: text("image_url"),
  imagePathname: text("image_pathname"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
export type ShopProduct = typeof shopProducts.$inferSelect;

export const shopVariants = pgTable("shop_variants", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  productId: uuid("product_id").notNull().references(() => shopProducts.id, { onDelete: "cascade" }),
  // Size or option label, e.g. "Large" or "One size".
  label: text("label").notNull().default("One size"),
  stock: integer("stock").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type ShopVariant = typeof shopVariants.$inferSelect;

export const shopOrders = pgTable("shop_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  employeeId: uuid("employee_id"),
  employeeName: text("employee_name"),
  employeeEmail: text("employee_email"),
  note: text("note"),
  status: text("status").notNull().default("submitted"),
  // 'square' | 'payroll'
  paymentMethod: text("payment_method").notNull().default("payroll"),
  // 'unpaid' | 'pending' | 'paid'
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  totalAmount: numeric("total_amount"),
  squareOrderId: text("square_order_id"),
  squarePaymentLinkId: text("square_payment_link_id"),
  paymentUrl: text("payment_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type ShopOrder = typeof shopOrders.$inferSelect;

// Snapshots the product/size at order time so history survives later edits.
export const shopOrderItems = pgTable("shop_order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  orderId: uuid("order_id").notNull().references(() => shopOrders.id, { onDelete: "cascade" }),
  productId: uuid("product_id"),
  variantId: uuid("variant_id"),
  productName: text("product_name").notNull(),
  variantLabel: text("variant_label"),
  unitPrice: numeric("unit_price"),
  quantity: integer("quantity").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type ShopOrderItem = typeof shopOrderItems.$inferSelect;

// ───────────────────────────────────────────────
// Document links — externally-hosted files (Google
// Drive, Dropbox, etc.) shown alongside uploaded
// documents, for when Blob storage isn't used.
// ───────────────────────────────────────────────
export const documentLinks = pgTable("document_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  category: text("category").notNull().default("general"),
  title: text("title").notNull(),
  url: text("url").notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type DocumentLink = typeof documentLinks.$inferSelect;

// ───────────────────────────────────────────────
// Credentials — licenses & certifications per
// employee (cosmetology, Barbicide, First Aid, CPR,
// Lifesaving) with expiration tracking and a
// two-step (review + confirm) renewal workflow.
// ───────────────────────────────────────────────
export const credentials = pgTable("credentials", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  // Credential type id (see lib/credentials-constants).
  type: text("type").notNull(),
  // 'active' | 'pending_review' | 'pending_confirm'
  status: text("status").notNull().default("active"),
  issuedAt: date("issued_at"),
  // Current effective expiration (null = nothing on file yet).
  expiresAt: date("expires_at"),
  certificatePathname: text("certificate_pathname"),
  // A renewal under review (the proposed new cert/date).
  pendingPathname: text("pending_pathname"),
  pendingIssuedAt: date("pending_issued_at"),
  pendingExpiresAt: date("pending_expires_at"),
  pendingSubmittedAt: timestamp("pending_submitted_at", { withTimezone: true }),
  pendingSubmittedBy: text("pending_submitted_by"),
  // First review (manager): cannot also confirm — separation of duties.
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  // Second confirmation (a different manager/owner).
  confirmedBy: text("confirmed_by"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  // Throttles reminder emails.
  lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
export type Credential = typeof credentials.$inferSelect;

// ───────────────────────────────────────────────
// Daily duties & checklists — reusable Opening /
// Closing checklist templates, plus per-day assigned
// tasks that each get acknowledged on completion.
// ───────────────────────────────────────────────
export const checklistTemplates = pgTable("checklist_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  name: text("name").notNull(),
  // A short note on when/who the checklist is for.
  description: text("description"),
  // Default "assign all to" token used when this checklist is dropped on a day.
  defaultAssignee: text("default_assignee"),
  // 'opening' | 'closing' | 'other'
  section: text("section").notNull().default("opening"),
  active: boolean("active").notNull().default(true),
  sortOrder: numeric("sort_order").default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type ChecklistTemplate = typeof checklistTemplates.$inferSelect;

export const checklistItems = pgTable("checklist_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  templateId: uuid("template_id").notNull().references(() => checklistTemplates.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  detail: text("detail"),
  // Optional sub-section heading within the checklist (e.g. "Arrival & Access").
  groupLabel: text("group_label"),
  sortOrder: numeric("sort_order").default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type ChecklistItem = typeof checklistItems.$inferSelect;

// A single duty assigned to one person for one date. Acknowledged by the
// assignee (or a manager) when complete.
export const dailyTasks = pgTable("daily_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: uuid("org_id"),
  locationId: uuid("location_id"),
  taskDate: date("task_date").notNull(),
  // 'opening' | 'closing' | 'role' | 'other'
  section: text("section").notNull().default("opening"),
  title: text("title").notNull(),
  detail: text("detail"),
  // Sub-section heading carried over from the checklist item.
  groupLabel: text("group_label"),
  assigneeId: uuid("assignee_id").references(() => employees.id, { onDelete: "set null" }),
  assignedBy: text("assigned_by"),
  // When set and no fixed assignee, the duty follows the day's bookings:
  // 'opener' = first appointment of the day, 'closer' = last appointment.
  autoRole: text("auto_role"),
  // A shared duty for anyone holding this job title (any one of them completes it).
  assigneeTitle: text("assignee_title"),
  // A shared duty for anyone with this access role (staff/manager/director).
  assigneeRole: text("assignee_role"),
  // 'open' | 'done'
  status: text("status").notNull().default("open"),
  acknowledgedById: uuid("acknowledged_by_id").references(() => employees.id, { onDelete: "set null" }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  sortOrder: numeric("sort_order").default("0"),
  // Where it came from (a checklist template), for reference.
  templateId: uuid("template_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type DailyTask = typeof dailyTasks.$inferSelect;

// A request to hand a duty to another team member. The target must accept,
// then a manager (Bethany/Emily/director/manager) approves.
export const taskReassignments = pgTable("task_reassignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  taskId: uuid("task_id").notNull().references(() => dailyTasks.id, { onDelete: "cascade" }),
  requestedById: uuid("requested_by_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  targetEmployeeId: uuid("target_employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  reason: text("reason"),
  // 'pending_accept' | 'accepted' | 'declined' | 'approved' | 'denied' | 'cancelled'
  status: text("status").notNull().default("pending_accept"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});
export type TaskReassignment = typeof taskReassignments.$inferSelect;
