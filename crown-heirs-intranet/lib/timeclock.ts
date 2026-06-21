import "server-only";

const AZ = "America/Phoenix"; // UTC-7, no DST

// Today's date in Arizona, as YYYY-MM-DD.
export function azToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: AZ });
}

// Sunday-start week containing `ymd` (YYYY-MM-DD), returned as the week's
// Sunday date string.
export function weekStartOf(ymd: string): string {
  const d = new Date(ymd + "T12:00:00Z");
  const dow = d.getUTCDay(); // 0 = Sun
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function addDaysYmd(ymd: string, n: number): string {
  const d = new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Worked hours for one entry (0 if still open).
export function hoursOf(entry: { clockIn: Date | string; clockOut: Date | string | null; breakMinutes: number }): number {
  if (!entry.clockOut) return 0;
  const ms = new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime();
  const hrs = ms / 3_600_000 - (entry.breakMinutes ?? 0) / 60;
  return Math.max(0, Math.round(hrs * 100) / 100);
}

// The instant of `time` (HH:MM) on `date` (YYYY-MM-DD), Arizona time.
export function azDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00-07:00`);
}

export function fmtAz(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    timeZone: AZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function fmtAzTime(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { timeZone: AZ, hour: "numeric", minute: "2-digit" });
}

export function azDateOf(d: Date | string): string {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: AZ });
}
