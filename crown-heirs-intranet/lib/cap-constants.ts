// Corrective Action Program — pure constants & helpers (no server deps).

export type InfractionCategory = { id: string; label: string };
export const CAP_CATEGORIES: InfractionCategory[] = [
  { id: "reliability", label: "Reliability & Readiness" },
  { id: "guest", label: "Guest Experience" },
  { id: "conduct", label: "Conduct & Culture" },
];
export function categoryLabel(id: string): string {
  return CAP_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export type Infraction = { id: string; category: string; label: string; points: number };

// The point schedule, verbatim from the Corrective Action Program.
export const INFRACTIONS: Infraction[] = [
  { id: "late_6_15", category: "reliability", label: "Late check-in, 6–15 min past scheduled start", points: 0.5 },
  { id: "late_15plus", category: "reliability", label: "Late check-in, 15+ min, or late without notice", points: 1 },
  { id: "checkout_incomplete", category: "reliability", label: "Checkout not completed (station not reset)", points: 1 },
  { id: "items_below_90", category: "reliability", label: "Weekly assigned items below the 90% standard", points: 1 },
  { id: "same_day_callout", category: "reliability", label: "Same-day call-out (with proper notice)", points: 1 },
  { id: "left_early", category: "reliability", label: "Leaving before scheduled end without approval", points: 1 },
  { id: "ncns", category: "reliability", label: "No-call, no-show", points: 4 },
  { id: "station_not_ready", category: "guest", label: "Station not sanitized or guest-ready between appts", points: 1 },
  { id: "skipped_playbook", category: "guest", label: "Skipping a required playbook moment", points: 1 },
  { id: "guest_complaint", category: "guest", label: "Guest complaint from conduct or preventable neglect", points: 2 },
  { id: "unprofessional_comm", category: "conduct", label: "Unprofessional communication", points: 2 },
  { id: "disruption", category: "conduct", label: "Disruption of the environment (gossip, drama, conflict)", points: 2 },
  { id: "online_conduct", category: "conduct", label: "Online/social conduct that violates the standards", points: 3 },
];
export function infractionById(id: string): Infraction | undefined {
  return INFRACTIONS.find((i) => i.id === id);
}
export function infractionLabel(id: string): string {
  return infractionById(id)?.label ?? id;
}

export type CapLevel = { threshold: number; key: string; label: string; response: string };
export const CAP_LEVELS: CapLevel[] = [
  { threshold: 2, key: "coaching", label: "Level 1 — Coaching", response: "Private, documented coaching conversation within one week." },
  { threshold: 4, key: "written", label: "Level 2 — Written Warning", response: "Written warning with a 30-day development plan, signed by both parties." },
  { threshold: 6, key: "final", label: "Level 3 — Final Warning", response: "Final written warning + structured 30-day plan with weekly check-ins." },
  { threshold: 8, key: "separation", label: "Separation", response: "Employment ends (or the contractor agreement is terminated)." },
];
// The highest level whose threshold the balance has reached (or null if under 2).
export function capLevelFor(balance: number): CapLevel | null {
  let hit: CapLevel | null = null;
  for (const lvl of CAP_LEVELS) if (balance >= lvl.threshold) hit = lvl;
  return hit;
}
export function nextThreshold(balance: number): number | null {
  for (const lvl of CAP_LEVELS) if (balance < lvl.threshold) return lvl.threshold;
  return null;
}

// ── Advancement — career-path tiers (from the KPI & Career Path docs) ──
export type Tier = { id: string; label: string; track: string; nextId: string | null; needs: string };
export const TIER_LADDER: Tier[] = [
  { id: "apprentice", label: "Stylist Apprentice", track: "Licensed", nextId: "assoc", needs: "Complete your DES/DOL program hours and school modules, meet monthly mentor evaluations, and earn your Arizona license to transition to Associate." },
  { id: "assoc", label: "Associate Stylist (I / S-I)", track: "Licensed", nextId: "stylist", needs: "Six months at or above Tier II standards: ~$5,000/mo FT revenue, 50%+ rebooking, 10%+ retail, 95%+ on-time, 90%+ items." },
  { id: "stylist", label: "Stylist (II / S-II)", track: "Licensed", nextId: "senior", needs: "Six months at or above Senior standards plus culture contribution: ~$6,800/mo FT, 60%+ rebooking, 15%+ retail, 8 CE hours." },
  { id: "senior", label: "Senior Stylist (III / S-III)", track: "Licensed", nextId: "master", needs: "Sustained Master-level performance: ~$7,500/mo FT, 70%+ rebooking, 20%+ retail, 12 CE hours, and teaching (shadow host, mentoring)." },
  { id: "master", label: "Master Stylist (IV)", track: "Licensed", nextId: "educator", needs: "12 months at Master with sustained FT revenue, Educator Certification, CEO/COO endorsement, and an active apprentice assignment." },
  { id: "educator", label: "Crown Educator (IV+E)", track: "Licensed", nextId: null, needs: "You're at the top of the Licensed Track — maintain the standard and grow the next generation." },
  { id: "s1", label: "Associate Specialty Stylist (S-I)", track: "Specialty", nextId: "s2", needs: "Six months at or above S-II: ~$5,600/mo FT, rebooking climbing each quarter, 95%+ on-time, 90%+ items." },
  { id: "s2", label: "Specialty Stylist (S-II)", track: "Specialty", nextId: "s3", needs: "Six months at or above S-III plus culture contribution: ~$6,400/mo FT, 60%+ rebooking, 15%+ retail, 8 CE hours." },
  { id: "s3", label: "Senior Specialty Stylist (S-III)", track: "Specialty", nextId: null, needs: "Top of the Specialty Track. To go further, pursue full licensure through the Crown Heirs Apprenticeship Program — we support that path." },
];
export function tierById(id: string | null | undefined): Tier | undefined {
  return id ? TIER_LADDER.find((t) => t.id === id) : undefined;
}
export function nextTier(id: string | null | undefined): Tier | undefined {
  const cur = tierById(id);
  return cur?.nextId ? tierById(cur.nextId) : undefined;
}

// Rolling window & restoration.
export const CAP_WINDOW_DAYS = 180; // points expire 6 months from activation
export const DISPUTE_DAYS = 7;
export const RESTORATION_DAYS = 30;

// Access ranking for the approval chain (a proposal is approved by a strictly
// higher level — except an owner, who is confirmed by a different owner).
export function accessRank(level: string | undefined): number {
  switch (level) {
    case "ceo": return 4;
    case "director": return 3;
    case "manager": return 2;
    case "staff": return 1;
    default: return 0;
  }
}
export function canApproveProposal(issuerLevel: string, approverLevel: string, samePerson: boolean): boolean {
  if (samePerson) return false;
  const a = accessRank(approverLevel);
  const i = accessRank(issuerLevel);
  if (a > i) return true;
  // Owner-proposed points are confirmed by a different owner.
  return issuerLevel === "ceo" && approverLevel === "ceo";
}
