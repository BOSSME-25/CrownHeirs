// Compliance Center — pure constants & state helpers (no server deps).
import { daysUntil, prettyDate, todayYMD } from "@/lib/credentials-constants";

export { prettyDate, todayYMD };

export type ComplianceLevel = { id: string; label: string; blurb: string };
export const COMPLIANCE_LEVELS: ComplianceLevel[] = [
  { id: "federal", label: "Federal", blurb: "U.S. employment & workplace law" },
  { id: "state", label: "State — Arizona", blurb: "Arizona employer requirements" },
  { id: "board", label: "Cosmetology Board", blurb: "AZ Board of Barbering & Cosmetology" },
];
export function levelLabel(id: string): string {
  return COMPLIANCE_LEVELS.find((l) => l.id === id)?.label ?? id;
}
export function isLevel(id: string): boolean {
  return COMPLIANCE_LEVELS.some((l) => l.id === id);
}

export type Cadence = { id: string; label: string };
export const CADENCES: Cadence[] = [
  { id: "once", label: "One-time" },
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "annual", label: "Annual" },
  { id: "biennial", label: "Every 2 years" },
];
export function cadenceLabel(id: string): string {
  return CADENCES.find((c) => c.id === id)?.label ?? id;
}
export function isCadence(id: string): boolean {
  return CADENCES.some((c) => c.id === id);
}

export const COMPLIANCE_WARN_DAYS = 30;

export type ComplianceState = {
  key: "na" | "attention" | "overdue" | "due" | "compliant";
  label: string;
  tone: "warn" | "bad" | "ok" | "info" | "muted";
  attention: boolean; // needs leadership's attention (dashboard flag)
};

// Effective state from the manager's status plus the due date.
export function complianceState(
  item: { status: string; dueAt: string | null },
  todayStr = todayYMD(),
): ComplianceState {
  if (item.status === "na") return { key: "na", label: "N/A", tone: "muted", attention: false };
  if (item.status === "attention") return { key: "attention", label: "Needs attention", tone: "bad", attention: true };
  const d = daysUntil(item.dueAt, todayStr);
  if (d !== null && d < 0) return { key: "overdue", label: `Overdue ${Math.abs(d)}d`, tone: "bad", attention: true };
  if (d !== null && d <= COMPLIANCE_WARN_DAYS) return { key: "due", label: `Due in ${d}d`, tone: "warn", attention: true };
  return { key: "compliant", label: "Compliant", tone: "ok", attention: false };
}
