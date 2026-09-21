// Create tables and sync the catalog. Idempotent, so it's safe to run from
// the admin page any number of times.
//
// The catalog file (from the Square export) is the authority for names,
// categories, descriptions, durations and bookability: those are re-applied
// on every run. Prices are only filled in where the row has none, so a price
// edited in the database survives. Services that drop out of the catalog are
// deactivated, never deleted (appointments may reference them).
const fs = require('fs');
const path = require('path');
const { query, withTransaction } = require('./db');

// Migrations run under an advisory lock so two concurrent runs (two admins
// clicking Set up, two test processes) queue instead of racing each other's
// CREATE TABLE — which surfaces in Postgres as a duplicate pg_type key.
const MIGRATE_LOCK = 724202601;
async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await withTransaction(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock($1)', [MIGRATE_LOCK]);
    await c.query(sql);
  });
}

async function seed() {
  // require() rather than fs so Vercel's bundler is guaranteed to include it.
  const { services } = require('./seed-data.json');
  const report = { services: 0, variations: 0, deactivated: 0, stylistCreated: false };

  await withTransaction(async (c) => {
    for (const s of services) {
      const { rows: [row] } = await c.query(
        `INSERT INTO services (slug, name, category, description, price_from_cents, duration_min, buffer_min, requires_consult, active, sort)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name, category = EXCLUDED.category, description = EXCLUDED.description,
           price_from_cents = COALESCE(services.price_from_cents, EXCLUDED.price_from_cents),
           duration_min = EXCLUDED.duration_min, buffer_min = EXCLUDED.buffer_min,
           requires_consult = EXCLUDED.requires_consult, active = EXCLUDED.active, sort = EXCLUDED.sort
         RETURNING id`,
        [s.slug, s.name, s.category, s.description, s.price_from_cents, s.duration_min, s.buffer_min, s.requires_consult, s.active, s.sort]
      );
      report.services++;
      for (const v of s.variations || []) {
        await c.query(
          `INSERT INTO service_variations (service_id, name, duration_min, bookable, sort)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (service_id, name) DO UPDATE SET
             duration_min = EXCLUDED.duration_min, bookable = EXCLUDED.bookable, sort = EXCLUDED.sort`,
          [row.id, v.name, v.duration_min, v.bookable, v.sort]
        );
        report.variations++;
      }
    }
    const { rowCount } = await c.query(
      `UPDATE services SET active = false WHERE active AND slug <> ALL($1)`, [services.map(s => s.slug)]
    );
    report.deactivated = rowCount;

    // A first stylist so the booking flow works on day one. Rename/add the
    // real team in the admin; this only runs while the table is empty.
    const { rows: existing } = await c.query('SELECT id FROM stylists LIMIT 1');
    if (!existing.length) {
      const { rows: [st] } = await c.query(
        `INSERT INTO stylists (slug, name, title, sort) VALUES ('bethany', 'Bethany', 'Stylist', 0) RETURNING id`
      );
      await c.query(`INSERT INTO stylist_services (stylist_id, service_id) SELECT $1, id FROM services`, [st.id]);
      // Tue–Sat, 9:00–18:00
      for (const wd of [2, 3, 4, 5, 6]) {
        await c.query(`INSERT INTO schedules (stylist_id, weekday, start_min, end_min) VALUES ($1, $2, 540, 1080)`, [st.id, wd]);
      }
      report.stylistCreated = true;
    }
  });
  return report;
}

async function status() {
  const one = async (sql) => Number((await query(sql)).rows[0].n);
  return {
    services:     await one('SELECT count(*) n FROM services WHERE active'),
    variations:   await one('SELECT count(*) n FROM service_variations WHERE bookable'),
    stylists:     await one('SELECT count(*) n FROM stylists WHERE active'),
    appointments: await one("SELECT count(*) n FROM appointments WHERE status='confirmed' AND starts_at > now()")
  };
}

module.exports = { migrate, seed, status };
