import "server-only";
import { isAdmin } from "@/lib/access";
import { getEmployeeByEmail } from "@/lib/employees";

// Access tiers, highest to lowest:
//   ceo      — CEO/COO (Emily/Bethany via ADMIN_EMAILS). Full system access.
//   director — manage the team (add/edit/delete people, manage managers),
//              but NOT system changes (admin tools, integrations, KPIs).
//   manager  — read-only visibility of HR info.
//   staff    — basic access.
export type AccessLevel = "ceo" | "director" | "manager" | "staff" | "none";

export type Access = {
  level: AccessLevel;
  canSystem: boolean; // admin page, documents, imports, KPIs, granting Director
  canManageTeam: boolean; // add/edit/delete team members, assign up to Manager
  canViewHr: boolean; // personal email, emergency contact, start date
};

export async function getAccess(email?: string | null): Promise<Access> {
  if (!email) return { level: "none", canSystem: false, canManageTeam: false, canViewHr: false };

  const ceo = isAdmin(email);
  let role = "staff";
  if (!ceo) {
    try {
      role = (await getEmployeeByEmail(email))?.role ?? "staff";
    } catch {
      role = "staff";
    }
  }

  const canSystem = ceo;
  // Legacy "admin" role is treated as director-level (CEO/COO live in env).
  const canManageTeam = canSystem || role === "director" || role === "admin";
  const canViewHr = canManageTeam || role === "manager";
  const level: AccessLevel = ceo ? "ceo" : (role === "director" || role === "admin") ? "director" : role === "manager" ? "manager" : "staff";

  return { level, canSystem, canManageTeam, canViewHr };
}

const ROLE_OPTS = [
  { value: "staff", label: "Staff" },
  { value: "manager", label: "Manager" },
  { value: "director", label: "Director" },
];

// Which roles the actor is allowed to assign. Directors can only grant up
// to Manager; the CEO/COO can also grant Director.
export function assignableRoles(canSystem: boolean) {
  return canSystem ? ROLE_OPTS : ROLE_OPTS.filter((r) => r.value !== "director");
}

// A short badge describing a person's access level (for the roster/profile).
// Returns null for plain staff so the UI stays clean.
export function accessLabelFor(
  email: string,
  role: string | null,
): { label: string; key: "ceo" | "director" | "manager" } | null {
  if (isAdmin(email)) return { label: "CEO / COO", key: "ceo" };
  if (role === "director" || role === "admin") return { label: "Director", key: "director" };
  if (role === "manager") return { label: "Manager", key: "manager" };
  return null;
}
