// Create tables and load the starting catalog. Idempotent, so it's safe to
// run from the admin page any number of times: existing rows are never
// overwritten (durations or prices edited later stay edited).
const fs = require('fs');
const path = require('path');
const { query, withTransaction } = require('./db');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await query(sql);
}

async function seed() {
  // require() rather than fs so Vercel's bundler is guaranteed to include it.
  const { services } = require('./seed-data.json');
  const report = { servicesAdded: 0, stylistCreated: false, hoursCreated: false };

  await withTransaction(async (c) => {
    for (const s of services) {
      const r = await c.query(
        `INSERT INTO services (slug, name, category, description, price_from_cents, duration_min, buffer_min, requires_consult, sort)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (slug) DO NOTHING`,
        [s.slug, s.name, s.category, s.description, s.price_from_cents, s.duration_min, s.buffer_min, s.requires_consult, s.sort]
      );
      report.servicesAdded += r.rowCount;
    }

    // A first stylist so the booking flow works on day one. Rename/add the
    // real team in the admin; this only runs while the table is empty.
    const { rows: existing } = await c.query('SELECT id FROM stylists LIMIT 1');
    if (!existing.length) {
      const { rows: [st] } = await c.query(
        `INSERT INTO stylists (slug, name, title, sort) VALUES ('bethany', 'Bethany', 'Stylist', 0) RETURNING id`
      );
      await c.query(
        `INSERT INTO stylist_services (stylist_id, service_id) SELECT $1, id FROM services`, [st.id]
      );
      // Tue–Sat, 9:00–18:00
      for (const wd of [2, 3, 4, 5, 6]) {
        await c.query(
          `INSERT INTO schedules (stylist_id, weekday, start_min, end_min) VALUES ($1, $2, 540, 1080)`, [st.id, wd]
        );
      }
      report.stylistCreated = true;
      report.hoursCreated = true;
    }
  });
  return report;
}

async function status() {
  const one = async (sql) => (await query(sql)).rows[0].n;
  return {
    services:     Number(await one('SELECT count(*) n FROM services')),
    stylists:     Number(await one('SELECT count(*) n FROM stylists')),
    appointments: Number(await one("SELECT count(*) n FROM appointments WHERE status='confirmed'"))
  };
}

module.exports = { migrate, seed, status };
