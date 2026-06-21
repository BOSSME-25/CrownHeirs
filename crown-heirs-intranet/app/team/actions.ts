"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { put } from "@vercel/blob";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { getAccess } from "@/lib/perms";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { listTeamMembers } from "@/lib/square";
import { getDefaultOrg } from "@/lib/org";
import { logAudit } from "@/lib/audit";

const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".webp", ".gif"];

// Upload a profile photo if one was attached. Returns the URL, or
// undefined if no (valid) file was provided.
async function uploadPhoto(formData: FormData): Promise<string | undefined> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return undefined;
  if (file.size > 5 * 1024 * 1024) throw new Error("Photo must be under 5 MB.");
  const lower = file.name.toLowerCase();
  if (!IMAGE_EXT.some((ext) => lower.endsWith(ext))) {
    throw new Error("Photo must be an image (PNG, JPG, WEBP, or GIF).");
  }
  const blob = await put(`avatars/${file.name}`, file, {
    access: "public",
    addRandomSuffix: true,
  });
  return blob.url;
}

// CEO/COO only — system-level actions (imports, integrations).
async function requireSystem() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canSystem) {
    throw new Error("Only the CEO/COO can do this.");
  }
}

// Directors and above — managing the team roster.
async function requireManageTeam() {
  const session = await auth();
  const access = await getAccess(session?.user?.email);
  if (!access.canManageTeam) {
    throw new Error("You don’t have permission to manage the team.");
  }
  return access;
}

// Guards a director from touching protected people or granting high roles.
function guardDirectorScope(
  access: { canSystem: boolean },
  opts: { targetEmail?: string; targetRole?: string | null; newRole?: string | null },
) {
  if (access.canSystem) return; // CEO/COO unrestricted
  const protectedRole = (r?: string | null) => r === "director" || r === "admin";
  if (opts.targetEmail && isAdmin(opts.targetEmail)) {
    throw new Error("Only the CEO/COO can manage that account.");
  }
  if (protectedRole(opts.targetRole)) {
    throw new Error("Only the CEO/COO can manage Directors.");
  }
  if (protectedRole(opts.newRole)) {
    throw new Error("Only the CEO/COO can grant Director access.");
  }
}

// Pull values out of the submitted form, normalizing empties to null.
function readForm(formData: FormData) {
  const get = (k: string) => {
    const v = formData.get(k);
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? null : s;
  };
  return {
    email: (get("email") ?? "").toLowerCase(),
    personalEmail: get("personalEmail"),
    locationId: get("locationId"),
    fullName: get("fullName") ?? "",
    phone: get("phone"),
    birthday: get("birthday"),
    jobTitle: get("jobTitle"),
    employmentType: get("employmentType"),
    status: get("status") ?? "active",
    role: get("role") ?? "staff",
    startDate: get("startDate"),
    wage: get("wage"),
    wageType: get("wageType"),
    emergencyContactName: get("emergencyContactName"),
    emergencyContactPhone: get("emergencyContactPhone"),
    notes: get("notes"),
    bio: get("bio"),
    whyCrownHeirs: get("whyCrownHeirs"),
    fiveYearPlan: get("fiveYearPlan"),
    favoriteAway: get("favoriteAway"),
    squareTeamMemberId: get("squareTeamMemberId"),
  };
}

export async function createEmployee(formData: FormData) {
  const access = await requireManageTeam();
  const data = readForm(formData);
  if (!data.email || !data.fullName) {
    throw new Error("Name and email are required.");
  }
  guardDirectorScope(access, { newRole: data.role });
  const photoUrl = await uploadPhoto(formData);
  const org = await getDefaultOrg();
  await db.insert(employees).values({ ...data, orgId: org?.id ?? null, photoUrl: photoUrl ?? null });
  const session = await auth();
  await logAudit({ actorEmail: session?.user?.email, action: "create", entity: "employee", detail: `${data.fullName} (${data.role})` });
  revalidatePath("/team");
  redirect(`/team?ok=${encodeURIComponent("Team member added")}`);
}

export async function updateEmployee(id: string, formData: FormData) {
  const access = await requireManageTeam();
  const data = readForm(formData);
  if (!data.email || !data.fullName) {
    throw new Error("Name and email are required.");
  }
  const target = (await db.select().from(employees).where(eq(employees.id, id)))[0];
  guardDirectorScope(access, {
    targetEmail: target?.email,
    targetRole: target?.role,
    newRole: data.role,
  });
  const photoUrl = await uploadPhoto(formData);
  await db
    .update(employees)
    .set({
      ...data,
      // Only replace the photo when a new one was uploaded.
      ...(photoUrl !== undefined ? { photoUrl } : {}),
      updatedAt: new Date(),
    })
    .where(eq(employees.id, id));
  const session = await auth();
  const roleNote = target && target.role !== data.role ? ` · role ${target.role}→${data.role}` : "";
  await logAudit({ actorEmail: session?.user?.email, action: "update", entity: "employee", entityId: id, detail: `${data.fullName}${roleNote}` });
  revalidatePath("/team");
  redirect(`/team?ok=${encodeURIComponent("Team member updated")}`);
}

export async function deleteEmployee(id: string) {
  const access = await requireManageTeam();
  const target = (await db.select().from(employees).where(eq(employees.id, id)))[0];
  guardDirectorScope(access, { targetEmail: target?.email, targetRole: target?.role });
  await db.delete(employees).where(eq(employees.id, id));
  const session = await auth();
  await logAudit({ actorEmail: session?.user?.email, action: "delete", entity: "employee", entityId: id, detail: target?.fullName });
  revalidatePath("/team");
  redirect(`/team?ok=${encodeURIComponent("Team member removed")}`);
}

// Seed the roster from Square team members. Matches existing people by name
// (linking them), otherwise creates a new record with a placeholder email
// that an admin replaces later with the person's real Google login.
export async function importFromSquare() {
  await requireSystem();
  const members = await listTeamMembers();
  if (members.length === 0) {
    redirect(`/team?ok=${encodeURIComponent("No Square team members found — check the Square connection/permissions.")}`);
  }

  const org = await getDefaultOrg();
  const existing = await db.select().from(employees);
  const bySquare = new Set(existing.filter((e) => e.squareTeamMemberId).map((e) => e.squareTeamMemberId));
  const byName = new Map(
    existing.filter((e) => !e.squareTeamMemberId).map((e) => [e.fullName.trim().toLowerCase(), e.id]),
  );

  let added = 0;
  let linked = 0;
  for (const m of members) {
    if (bySquare.has(m.id)) continue;
    const key = m.name.trim().toLowerCase();
    const matchId = byName.get(key);
    if (matchId) {
      await db
        .update(employees)
        .set({
          squareTeamMemberId: m.id,
          ...(m.phone ? { phone: m.phone } : {}),
          ...(m.email ? { personalEmail: m.email } : {}),
        })
        .where(eq(employees.id, matchId));
      byName.delete(key);
      linked += 1;
    } else {
      await db.insert(employees).values({
        orgId: org?.id ?? null,
        fullName: m.name,
        email: `pending-${m.id}@crownheirs.invalid`,
        personalEmail: m.email,
        phone: m.phone,
        squareTeamMemberId: m.id,
        role: "staff",
        status: "active",
      });
      added += 1;
    }
    bySquare.add(m.id);
  }

  revalidatePath("/team");
  redirect(
    `/team?ok=${encodeURIComponent(`Square import complete — ${added} added, ${linked} linked. Add their emails via Edit.`)}`,
  );
}

// ── Homebase CSV import ──

// Minimal RFC-4180-ish CSV parser (handles quoted fields, commas, newlines).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function toYmd(s: string | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let [, mo, d, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

export async function importFromHomebaseCsv(formData: FormData) {
  await requireSystem();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/team?ok=${encodeURIComponent("No CSV file selected.")}`);
  }
  const rows = parseCsv(await (file as File).text());
  if (rows.length < 2) {
    redirect(`/team?ok=${encodeURIComponent("That CSV had no data rows.")}`);
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };
  const idx = {
    first: col("first name", "firstname", "first"),
    last: col("last name", "lastname", "last"),
    name: col("name", "full name", "employee", "employee name"),
    email: col("email", "personal email", "email address", "e-mail"),
    phone: col("phone", "phone number", "mobile", "cell", "mobile phone"),
    title: col("role", "job title", "title", "position"),
    start: col("hire date", "start date", "hired", "hire", "date hired"),
    birthday: col("birthday", "date of birth", "dob", "birth date", "birthdate"),
    ecName: col("emergency contact", "emergency contact name", "emergency name"),
    ecPhone: col("emergency contact phone", "emergency phone", "emergency contact number"),
  };
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");

  const org = await getDefaultOrg();
  const existing = await db.select().from(employees);
  const byName = new Map(existing.map((e) => [e.fullName.trim().toLowerCase(), e.id]));

  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => !c.trim())) continue;
    const full =
      get(row, idx.name) ||
      [get(row, idx.first), get(row, idx.last)].filter(Boolean).join(" ");
    if (!full) { skipped++; continue; }

    const fields = {
      personalEmail: get(row, idx.email) || null,
      phone: get(row, idx.phone) || null,
      jobTitle: get(row, idx.title) || null,
      startDate: toYmd(get(row, idx.start)),
      birthday: toYmd(get(row, idx.birthday)),
      emergencyContactName: get(row, idx.ecName) || null,
      emergencyContactPhone: get(row, idx.ecPhone) || null,
    };

    const matchId = byName.get(full.trim().toLowerCase());
    if (matchId) {
      // Only fill blanks — don't overwrite values an admin already set.
      const cur = existing.find((e) => e.id === matchId)!;
      const set: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (v && !(cur as Record<string, unknown>)[k]) set[k] = v;
      }
      if (Object.keys(set).length) {
        await db.update(employees).set(set).where(eq(employees.id, matchId));
      }
      updated++;
    } else {
      await db.insert(employees).values({
        orgId: org?.id ?? null,
        fullName: full,
        email: `pending-${randomUUID()}@crownheirs.invalid`,
        role: "staff",
        status: "active",
        ...fields,
      });
      added++;
    }
  }

  revalidatePath("/team");
  redirect(
    `/team?ok=${encodeURIComponent(`Homebase import — ${added} added, ${updated} updated${skipped ? `, ${skipped} skipped` : ""}. Add Crown Heirs emails via Edit.`)}`,
  );
}
