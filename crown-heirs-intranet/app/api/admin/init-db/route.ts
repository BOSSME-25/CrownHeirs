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

    // ── Multi-tenant foundation ──
    await sql`
      CREATE TABLE IF NOT EXISTS organizations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL,
        slug text NOT NULL UNIQUE,
        status text NOT NULL DEFAULT 'active',
        settings jsonb,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS locations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name text NOT NULL,
        square_location_id text,
        timezone text DEFAULT 'America/Phoenix',
        address text,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz DEFAULT now()
      )
    `;
    // Seed Crown Heirs as org #1 + a default location, once.
    await sql`
      INSERT INTO organizations (name, slug)
      SELECT 'Crown Heirs', 'crown-heirs'
      WHERE NOT EXISTS (SELECT 1 FROM organizations)
    `;
    await sql`
      INSERT INTO locations (org_id, name)
      SELECT o.id, 'Main'
      FROM organizations o
      WHERE o.slug = 'crown-heirs'
        AND NOT EXISTS (SELECT 1 FROM locations WHERE org_id = o.id)
    `;

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
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS square_team_member_id text`;
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS personal_email text`;
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS org_id uuid`;
    await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS location_id uuid`;
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
    await sql`ALTER TABLE shifts ADD COLUMN IF NOT EXISTS org_id uuid`;
    await sql`ALTER TABLE shifts ADD COLUMN IF NOT EXISTS location_id uuid`;
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
    await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS org_id uuid`;
    await sql`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS location_id uuid`;
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

    // ── Phase 4 features ──
    await sql`
      CREATE TABLE IF NOT EXISTS policies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid,
        title text NOT NULL,
        body text,
        file_url text,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS policy_acks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        acknowledged_at timestamptz DEFAULT now(),
        UNIQUE (policy_id, employee_id)
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS onboarding_tasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid,
        title text NOT NULL,
        description text,
        sort_order numeric DEFAULT 0,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS onboarding_progress (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id uuid NOT NULL REFERENCES onboarding_tasks(id) ON DELETE CASCADE,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        done boolean NOT NULL DEFAULT false,
        done_at timestamptz,
        UNIQUE (task_id, employee_id)
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS reviews (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        reviewer_email text,
        period_label text,
        review_date date,
        rating integer,
        strengths text,
        growth text,
        goals text,
        status text NOT NULL DEFAULT 'draft',
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS audit_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid,
        actor_email text,
        action text NOT NULL,
        entity text,
        entity_id text,
        detail text,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS time_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid,
        location_id uuid,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        clock_in timestamptz NOT NULL,
        clock_out timestamptz,
        break_minutes integer NOT NULL DEFAULT 0,
        note text,
        edited_by text,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS pto_ledger (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        hours numeric NOT NULL,
        kind text NOT NULL DEFAULT 'adjustment',
        note text,
        effective_date date,
        request_id uuid,
        created_by text,
        created_at timestamptz DEFAULT now()
      )
    `;

    // ── Inventory ──
    await sql`
      CREATE TABLE IF NOT EXISTS vendors (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid,
        name text NOT NULL,
        contact_name text,
        phone text,
        email text,
        website text,
        account_number text,
        notes text,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS inventory_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid,
        location_id uuid,
        vendor_id uuid,
        name text NOT NULL,
        brand text,
        category text NOT NULL DEFAULT 'retail',
        sku text,
        size text,
        unit text,
        cost numeric(10,2),
        retail_price numeric(10,2),
        on_hand numeric NOT NULL DEFAULT 0,
        reorder_point numeric NOT NULL DEFAULT 0,
        active boolean NOT NULL DEFAULT true,
        notes text,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS inventory_txns (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid,
        item_id uuid NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
        delta numeric NOT NULL,
        reason text NOT NULL DEFAULT 'adjust',
        note text,
        unit_cost numeric(10,2),
        actor_email text,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS inventory_txns_item_idx ON inventory_txns (item_id, created_at DESC)`;

    // ── Document links (externally-hosted files) ──
    await sql`
      CREATE TABLE IF NOT EXISTS document_links (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid,
        category text NOT NULL DEFAULT 'general',
        title text NOT NULL,
        url text NOT NULL,
        created_by text,
        created_at timestamptz DEFAULT now()
      )
    `;

    // ── Daily duties & checklists ──
    await sql`
      CREATE TABLE IF NOT EXISTS checklist_templates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid,
        name text NOT NULL,
        section text NOT NULL DEFAULT 'opening',
        active boolean NOT NULL DEFAULT true,
        sort_order numeric DEFAULT 0,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS checklist_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id uuid NOT NULL REFERENCES checklist_templates(id) ON DELETE CASCADE,
        title text NOT NULL,
        detail text,
        sort_order numeric DEFAULT 0,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS daily_tasks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid,
        location_id uuid,
        task_date date NOT NULL,
        section text NOT NULL DEFAULT 'opening',
        title text NOT NULL,
        detail text,
        assignee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
        assigned_by text,
        status text NOT NULL DEFAULT 'open',
        acknowledged_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
        acknowledged_at timestamptz,
        sort_order numeric DEFAULT 0,
        template_id uuid,
        created_at timestamptz DEFAULT now()
      )
    `;
    await sql`ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS group_label text`;
    await sql`ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS group_label text`;
    await sql`ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS auto_role text`;
    await sql`ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS assignee_title text`;
    await sql`ALTER TABLE daily_tasks ADD COLUMN IF NOT EXISTS assignee_role text`;
    await sql`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS description text`;
    await sql`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS default_assignee text`;
    await sql`CREATE INDEX IF NOT EXISTS daily_tasks_date_idx ON daily_tasks (task_date, section, sort_order)`;
    await sql`
      CREATE TABLE IF NOT EXISTS task_reassignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id uuid NOT NULL REFERENCES daily_tasks(id) ON DELETE CASCADE,
        requested_by_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        target_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        reason text,
        status text NOT NULL DEFAULT 'pending_accept',
        accepted_at timestamptz,
        decided_by text,
        decided_at timestamptz,
        created_at timestamptz DEFAULT now()
      )
    `;

    // ── Credentials (licenses & certifications) ──
    await sql`
      CREATE TABLE IF NOT EXISTS credentials (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id uuid,
        employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        type text NOT NULL,
        status text NOT NULL DEFAULT 'active',
        issued_at date,
        expires_at date,
        certificate_pathname text,
        pending_pathname text,
        pending_issued_at date,
        pending_expires_at date,
        pending_submitted_at timestamptz,
        pending_submitted_by text,
        reviewed_by text,
        reviewed_at timestamptz,
        confirmed_by text,
        confirmed_at timestamptz,
        last_reminded_at timestamptz,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now(),
        UNIQUE (employee_id, type)
      )
    `;
    // Auto-assign the universal credentials to every active employee (idempotent).
    await sql`
      INSERT INTO credentials (org_id, employee_id, type)
      SELECT e.org_id, e.id, t.type
      FROM employees e
      CROSS JOIN (VALUES ('barbicide'), ('first_aid'), ('cpr'), ('lifesaving')) AS t(type)
      WHERE e.status = 'active'
      ON CONFLICT (employee_id, type) DO NOTHING
    `;

    // Backfill existing rows to Crown Heirs org + Main location.
    const [{ id: orgId } = { id: null }] = (await sql`
      SELECT id FROM organizations WHERE slug = 'crown-heirs' LIMIT 1
    `) as { id: string | null }[];
    if (orgId) {
      const [{ id: locId } = { id: null }] = (await sql`
        SELECT id FROM locations WHERE org_id = ${orgId} ORDER BY created_at LIMIT 1
      `) as { id: string | null }[];
      await sql`UPDATE employees SET org_id = ${orgId} WHERE org_id IS NULL`;
      await sql`UPDATE shifts SET org_id = ${orgId} WHERE org_id IS NULL`;
      await sql`UPDATE meetings SET org_id = ${orgId} WHERE org_id IS NULL`;
      if (locId) {
        await sql`UPDATE employees SET location_id = ${locId} WHERE location_id IS NULL`;
      }

      // Remove the early generic placeholder checklists, if present. They're
      // identified by items that only exist in that first-pass seed, so this
      // never touches checklists the salon has built themselves.
      await sql`
        DELETE FROM checklist_templates WHERE org_id = ${orgId} AND id IN (
          SELECT t.id FROM checklist_templates t
          JOIN checklist_items ci ON ci.template_id = t.id
          WHERE ci.title IN (
            'Make coffee and set up the beverage station',
            'Set the alarm and lock all doors'
          )
        )
      `;

      // Correct group headings + descriptions on checklists seeded by an earlier
      // version (before the source Word doc was reviewed). Scoped to this org's
      // checklist items; a no-op once the data is already correct.
      const fixGroup = async (from: string, to: string) => {
        await sql`
          UPDATE checklist_items SET group_label = ${to}
          WHERE group_label = ${from}
            AND template_id IN (SELECT id FROM checklist_templates WHERE org_id = ${orgId})
        `;
      };
      await fixGroup("Systems & Sign-In", "Systems & Schedule");
      await fixGroup("Station & Cleanup", "Station Breakdown");
      await fixGroup("Client & Records", "Guest & Records");
      await fixGroup("Laundry & Handoff", "Laundry & Handover");
      await fixGroup("Stations & Cleanup", "Stations & Equipment");

      // Move the End-of-Shift checklist (and any duties already created from it)
      // onto the dedicated "endshift" board section instead of "Other".
      await sql`
        UPDATE checklist_templates SET section = 'endshift'
        WHERE org_id = ${orgId} AND name = 'End-of-Shift Checklist' AND section = 'other'
      `;
      await sql`
        UPDATE daily_tasks SET section = 'endshift'
        WHERE section = 'other' AND template_id IN (
          SELECT id FROM checklist_templates WHERE org_id = ${orgId} AND name = 'End-of-Shift Checklist'
        )
      `;

      // Crown Heirs' real Stylist Shift Checklists (imported from their Word doc).
      // Seeded per-checklist only when that checklist doesn't already exist, so
      // re-running setup never duplicates or overwrites edits. The description
      // is backfilled onto existing checklists when missing.
      const seed = async (
        name: string,
        section: string,
        description: string,
        groups: { group: string; items: string[] }[],
      ) => {
        const [{ exists } = { exists: false }] = (await sql`
          SELECT EXISTS (
            SELECT 1 FROM checklist_templates WHERE org_id = ${orgId} AND name = ${name}
          ) AS exists
        `) as { exists: boolean }[];
        if (exists) {
          await sql`
            UPDATE checklist_templates SET description = ${description}
            WHERE org_id = ${orgId} AND name = ${name} AND (description IS NULL OR description = '')
          `;
          return;
        }
        const [tpl] = (await sql`
          INSERT INTO checklist_templates (org_id, name, section, description)
          VALUES (${orgId}, ${name}, ${section}, ${description}) RETURNING id
        `) as { id: string }[];
        let i = 0;
        for (const g of groups) {
          for (const item of g.items) {
            await sql`
              INSERT INTO checklist_items (template_id, title, group_label, sort_order)
              VALUES (${tpl.id}, ${item}, ${g.group}, ${i})
            `;
            i++;
          }
        }
      };

      await seed("Opening Checklist", "opening",
        "Complete on arrival, before your first guest. The first stylist in opens the space.", [
        { group: "Arrival & Access", items: [
          "Disarm the alarm on entry.",
          "Unlock and open the front door for business.",
          "Bring the sidewalk sign out front.",
          "Flip the door sign to “Open.”",
          "Confirm the back door is closed and secured.",
          "Turn on all lights and open the blinds.",
          "Turn on all TVs and music.",
        ] },
        { group: "Station & Tools", items: [
          "Sanitize your station, chair, and mirror, and set up for the day.",
          "Confirm tools are clean, sanitized, and ready (combs, shears, clips, brushes).",
          "Power on and test your equipment — dryers, irons, steamers, wax warmer.",
          "Stock capes, towels, and neck strips at your station.",
        ] },
        { group: "Backbar & Cart", items: [
          "Check backbar product levels (shampoo, conditioner, treatments) and refill as needed.",
          "Update and restock your cart inventory for the day.",
          "Note any low or out-of-stock product for the receptionist or manager.",
        ] },
        { group: "Laundry & Facilities", items: [
          "Start a load of towels if the bin is full; check the washer and dryer.",
          "Bathroom check — clean, stocked, and presentable.",
          "Quick walkthrough: front desk, backbar, stations, private room, break room.",
        ] },
        { group: "Systems & Schedule", items: [
          "Log in to the POS on the iPad and shop phone for your shift.",
          "Review your own schedule and confirm your appointments for the day.",
        ] },
      ]);

      await seed("End-of-Shift Checklist", "endshift",
        "Complete when your shift ends and the salon is still open. Leave your station guest-ready for whoever is next.", [
        { group: "Station Breakdown", items: [
          "Sanitize and wipe down your station, chair, and mirror.",
          "Clean and disinfect your tools; return any shared tools to their place.",
          "Turn off and unplug your personal equipment (irons, dryers, steamers, wax warmer).",
          "Sweep and clear hair from your area.",
        ] },
        { group: "Inventory & Restock", items: [
          "Update your cart inventory — note what you used or depleted.",
          "Restock your station supplies (capes, towels, neck strips, product) for the next stylist.",
          "Flag any low or out-of-stock items for reorder.",
        ] },
        { group: "Guest & Records", items: [
          "Log client notes, formulas, and purchases in the system.",
          "Confirm your guests are rebooked before they leave.",
          "Log out of the iPad or shop phone if you used it for your transactions.",
        ] },
        { group: "Laundry & Handover", items: [
          "Start or move a load of towels if you used them; check the washer and dryer.",
          "Bathroom or private-room check if you were the last to use it.",
          "Leave a note for the receptionist or next stylist on anything outstanding — maintenance, guest follow-up, or special requests.",
        ] },
      ]);

      await seed("Closing Checklist", "closing",
        "Complete when you are the last to leave. This list secures the salon — every item matters.", [
        { group: "Stations & Equipment", items: [
          "Sanitize all stations, chairs, mirrors, and high-touch surfaces.",
          "Turn off AND unplug all equipment — flat irons, blow dryers, steamers, wax warmers.",
          "Sweep and clear all floors.",
          "Wipe down the backbar and bowls.",
        ] },
        { group: "Inventory", items: [
          "Complete final cart inventory updates and note low stock for reorder.",
          "Confirm retail and backbar restock is logged for the opener.",
        ] },
        { group: "Laundry & Facilities", items: [
          "Washer and dryer check — confirm the final load is done and both are off.",
          "Bathroom check — clean, stocked, water off, lights off.",
          "Break room check — appliances off, surfaces clear.",
        ] },
        { group: "Systems", items: [
          "Log out of the POS on the iPad.",
          "Log out of the POS on the shop phone.",
          "Power down the TVs, music, and any non-essential appliances.",
        ] },
        { group: "Lockup & Security", items: [
          "Bring the sidewalk sign back in.",
          "Flip the door sign to “Closed.”",
          "Close the blinds.",
          "Turn off all lights.",
          "Close and lock the back door.",
          "Lock the front door.",
          "Set / arm the alarm.",
          "Final walkthrough before you leave.",
        ] },
      ]);
    }

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Database setup failed" },
      { status: 500 },
    );
  }
}
