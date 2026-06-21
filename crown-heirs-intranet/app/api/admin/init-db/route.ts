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
        photo_url text,
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
    // For databases created before these columns existed.
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo_url text`;
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS birthday date`;
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS bio text`;
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS why_crown_heirs text`;
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS five_year_plan text`;
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS favorite_away text`;
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS calendar_token text`;
    await sql`
      CREATE TABLE IF NOT EXISTS shifts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        shift_date date NOT NULL,
        start_time text NOT NULL,
        end_time text NOT NULL,
        position text,
        notes text,
        published boolean NOT NULL DEFAULT false,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS shift_duties (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        description text NOT NULL,
        done boolean NOT NULL DEFAULT false,
        sort_order numeric DEFAULT 0,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS time_off_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        start_date date NOT NULL,
        end_date date NOT NULL,
        type text,
        note text,
        status text NOT NULL DEFAULT 'pending',
        decided_by text,
        decided_at timestamptz,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS swap_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
        requested_by_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        target_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
        reason text,
        status text NOT NULL DEFAULT 'pending',
        decided_by text,
        decided_at timestamptz,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS training_videos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        youtube_id text NOT NULL,
        description text,
        section text,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`ALTER TABLE training_videos ADD COLUMN IF NOT EXISTS section text`;
    await sql`ALTER TABLE training_videos ADD COLUMN IF NOT EXISTS required boolean NOT NULL DEFAULT false`;
    await sql`ALTER TABLE training_videos ADD COLUMN IF NOT EXISTS due_date date`;
    await sql`ALTER TABLE training_videos ADD COLUMN IF NOT EXISTS required_roles jsonb`;
    await sql`
      CREATE TABLE IF NOT EXISTS video_views (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        video_id uuid NOT NULL REFERENCES training_videos(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        watched_at timestamptz DEFAULT now(),
        UNIQUE (video_id, employee_id)
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS quiz_questions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        video_id uuid NOT NULL REFERENCES training_videos(id) ON DELETE CASCADE,
        prompt text NOT NULL,
        options jsonb NOT NULL,
        correct_index integer NOT NULL,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS quiz_attempts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        video_id uuid NOT NULL REFERENCES training_videos(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        score integer NOT NULL,
        total integer NOT NULL,
        taken_at timestamptz DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS meetings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        meeting_date date NOT NULL,
        start_time text,
        location text,
        meeting_url text,
        notes text,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS meeting_url text`;
    await sql`
      CREATE TABLE IF NOT EXISTS suggestions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        message text NOT NULL,
        anonymous boolean NOT NULL DEFAULT false,
        author_name text,
        status text NOT NULL DEFAULT 'new',
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS meeting_notes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        kind text NOT NULL DEFAULT 'team',
        title text NOT NULL,
        meeting_date date,
        body text,
        file_url text,
        employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
        created_by text,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        sender_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        recipient_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        body text NOT NULL,
        read_at timestamptz,
        created_at timestamptz DEFAULT now()
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
