// Credential / license types and pure helpers (no server-only deps).

export type CredentialType = { id: string; label: string; universal: boolean };

// Universal credentials apply to every active employee. Cosmetology is assigned
// per person (not everyone is licensed).
export const CREDENTIAL_TYPES: CredentialType[] = [
  { id: "cosmetology", label: "Cosmetology License", universal: false },
  { id: "barbicide", label: "Barbicide Certification", universal: true },
  { id: "first_aid", label: "First Aid", universal: true },
  { id: "cpr", label: "CPR", universal: true },
  { id: "lifesaving", label: "Lifesaving Certification", universal: true },
];
export const CREDENTIAL_TYPE_IDS = CREDENTIAL_TYPES.map((c) => c.id);
export const UNIVERSAL_TYPES = CREDENTIAL_TYPES.filter((c) => c.universal).map((c) => c.id);

export function credentialLabel(id: string): string {
  return CREDENTIAL_TYPES.find((c) => c.id === id)?.label ?? id;
}
export function isCredentialType(id: string): boolean {
  return CREDENTIAL_TYPE_IDS.includes(id);
}

// How far out we start flagging / reminding.
export const WARN_DAYS = 90;

export const todayYMD = (tz = "America/Phoenix"): string => {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
};

export function daysUntil(dateYMD: string | null, todayStr = todayYMD()): number | null {
  if (!dateYMD) return null;
  const a = Date.parse(dateYMD + "T00:00:00Z");
  const b = Date.parse(todayStr + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

export function prettyDate(dateYMD: string | null): string {
  if (!dateYMD) return "—";
  return new Date(dateYMD + "T00:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC", month: "short", day: "numeric", year: "numeric",
  });
}

// A credential's display state. `urgent` means it should appear on dashboards
// (anything that isn't "current and well in date").
export type CredState = {
  key: "review" | "confirm" | "missing" | "expired" | "due" | "current";
  label: string;
  tone: "warn" | "bad" | "ok" | "info";
  urgent: boolean;
  daysLeft: number | null;
};

export function credentialState(
  c: { status: string; expiresAt: string | null },
  todayStr = todayYMD(),
): CredState {
  if (c.status === "pending_review") {
    return { key: "review", label: "Awaiting manager review", tone: "info", urgent: true, daysLeft: daysUntil(c.expiresAt, todayStr) };
  }
  if (c.status === "pending_confirm") {
    return { key: "confirm", label: "Awaiting confirmation", tone: "info", urgent: true, daysLeft: daysUntil(c.expiresAt, todayStr) };
  }
  if (!c.expiresAt) {
    return { key: "missing", label: "Not on file", tone: "bad", urgent: true, daysLeft: null };
  }
  const d = daysUntil(c.expiresAt, todayStr);
  if (d !== null && d < 0) {
    return { key: "expired", label: `Expired ${Math.abs(d)}d ago`, tone: "bad", urgent: true, daysLeft: d };
  }
  if (d !== null && d <= WARN_DAYS) {
    return { key: "due", label: `Due in ${d}d`, tone: "warn", urgent: true, daysLeft: d };
  }
  return { key: "current", label: "Current", tone: "ok", urgent: false, daysLeft: d };
}
