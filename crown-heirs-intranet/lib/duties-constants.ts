// Pure constants & helpers for Daily Duties — no server-only deps, safe to
// import from client components.

// Sections a duty can belong to on the daily board (rendered in this order).
export const DUTY_SECTIONS = [
  { id: "opening", label: "Opening Checklist" },
  { id: "endshift", label: "End-of-Shift" },
  { id: "closing", label: "Closing Checklist" },
  { id: "role", label: "Roles & Responsibilities" },
  { id: "other", label: "Other Duties" },
] as const;
export const DUTY_SECTION_IDS = DUTY_SECTIONS.map((s) => s.id) as string[];

// Templates only cover the repeatable checklists (and custom lists).
export const TEMPLATE_SECTIONS = [
  { id: "opening", label: "Opening" },
  { id: "endshift", label: "End-of-Shift" },
  { id: "closing", label: "Closing" },
  { id: "other", label: "Other" },
] as const;
export const TEMPLATE_SECTION_IDS = TEMPLATE_SECTIONS.map((s) => s.id) as string[];

export function sectionLabel(id: string): string {
  return DUTY_SECTIONS.find((s) => s.id === id)?.label ?? "Duties";
}

// Reassignment status → friendly label.
export function reassignStatusLabel(status: string, targetName?: string | null): string {
  switch (status) {
    case "pending_accept":
      return `Handoff to ${targetName ?? "teammate"} — awaiting their acceptance`;
    case "accepted":
      return `${targetName ?? "Teammate"} accepted — awaiting manager approval`;
    case "approved":
      return "Handoff approved";
    case "declined":
      return "Handoff declined";
    case "denied":
      return "Handoff denied by manager";
    case "cancelled":
      return "Handoff cancelled";
    default:
      return status;
  }
}

// Today's date (YYYY-MM-DD) in the salon's timezone. Falls back to local.
export function salonToday(tz = "America/Phoenix"): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// Add/subtract days from a YYYY-MM-DD string, returning YYYY-MM-DD.
export function shiftDate(date: string, days: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// "Monday, Jun 22" style label for a YYYY-MM-DD string.
export function prettyDate(date: string): string {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
