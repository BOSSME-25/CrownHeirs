import { auth } from "@/auth";
import { isAdmin } from "@/lib/access";
import { sql } from "@/lib/db";

// One-time (idempotent) database setup, run by an admin from the Admin page.
// Safe to run repeatedly — it only creates things that don't already exist.
// As new features are added in later phases, new tables go here too.
export async function POST() {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
    await sql`
      CREATE TABLE IF NOT EXISTS employees (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL UNIQUE,
        full_name text NOT NULL,
        phone text,
        job_title text,
        employment_type text,
        status text NOT NULL DEFAULT 'active',
        role text NOT NULL DEFAULT 'staff',
        start_date date,
        wage numeric(10,2),
        wage_type text,
        emergency_contact_name text,
        emergency_contact_phone text,
        notes text,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )
    `;
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Database setup failed" },
      { status: 500 },
    );
  }
}
