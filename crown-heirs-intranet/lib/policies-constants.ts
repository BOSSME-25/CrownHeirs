// Policy / document acknowledgment states — pure helpers, no server deps.

export type AckTone = "warn" | "bad" | "ok" | "info";

export type PolicyDocCategory = { id: string; label: string };

export const POLICY_CATEGORIES: PolicyDocCategory[] = [
  { id: "handbook", label: "Handbook" },
  { id: "policy", label: "Policy" },
  { id: "document", label: "Document" },
];

export function policyCategoryLabel(id: string): string {
  return POLICY_CATEGORIES.find((c) => c.id === id)?.label ?? "Policy";
}

export type AckState = {
  key: "pending" | "awaiting_confirm" | "complete";
  label: string;
  tone: AckTone;
  needsEmployee: boolean; // employee still has to read & sign
  needsManager: boolean; // acknowledged, waiting on a manager to confirm
  complete: boolean;
};

// Compute a person's sign-off state for a policy at its current version.
// `row` is their policy_acks record (or null if none exists yet).
export function ackState(
  row: { version: number; acknowledgedAt: Date | string | null; confirmedAt: Date | string | null } | null,
  policyVersion: number,
): AckState {
  // No row, or a row left over from an older version → needs to sign again.
  if (!row || row.version < policyVersion || !row.acknowledgedAt) {
    return { key: "pending", label: "Needs your signature", tone: "warn", needsEmployee: true, needsManager: false, complete: false };
  }
  if (!row.confirmedAt) {
    return { key: "awaiting_confirm", label: "Awaiting manager confirmation", tone: "info", needsEmployee: false, needsManager: true, complete: false };
  }
  return { key: "complete", label: "Signed & confirmed", tone: "ok", needsEmployee: false, needsManager: false, complete: true };
}

export function ackWhen(d: Date | string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
