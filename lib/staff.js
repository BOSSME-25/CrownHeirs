// Staff-side operations behind the admin password: the day's book, status
// changes, time off, and the team roster with hours and services.
const { query, withTransaction, getSettings } = require('./db');
const { localToUtc, addDays } = require('./tz');
const { BookingError } = require('./booking');
const notify = require('./notify');

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['confirmed', 'cancelled', 'completed', 'no_show'];

const APPT_SELECT = `
  SELECT a.id, a.code, a.starts_at, a.ends_at, a.status, a.notes, a.source, a.variation_name, a.created_at,
         s.name AS service_name, s.slug AS service_slug, s.price_from_cents,
         st.name AS stylist_name, st.slug AS stylist_slug,
         c.name AS client_name, c.phone, c.email
    FROM appointments a
    JOIN services s ON s.id = a.service_id
    JOIN stylists st ON st.id = a.stylist_id
    JOIN clients c ON c.id = a.client_id`;

const shape = a => ({
  code: a.code, startsAt: a.starts_at, endsAt: a.ends_at, status: a.status, notes: a.notes,
  source: a.source, createdAt: a.created_at,
  service: { slug: a.service_slug, name: a.service_name, price_from_cents: a.price_from_cents },
  variation: { name: a.variation_name },
  stylist: { slug: a.stylist_slug, name: a.stylist_name },
  client: { name: a.client_name, phone: a.phone, email: a.email }
});

// Everything on the book for one local day: appointments (all statuses) and time off.
async function day(date) {
  if (!YMD.test(date)) throw new BookingError(400, 'Date must be YYYY-MM-DD');
  const settings = await getSettings();
  const from = localToUtc(date, 0, settings.time_zone);
  const to   = localToUtc(addDays(date, 1), 0, settings.time_zone);
  const [appts, off, stylists] = await Promise.all([
    query(`${APPT_SELECT} WHERE a.starts_at >= $1 AND a.starts_at < $2 ORDER BY a.starts_at, st.sort`, [from, to]),
    query(`SELECT t.id, t.starts_at, t.ends_at, t.reason, st.slug AS stylist_slug, st.name AS stylist_name
             FROM time_off t JOIN stylists st ON st.id = t.stylist_id
            WHERE t.starts_at < $2 AND t.ends_at > $1 ORDER BY t.starts_at`, [from, to]),
    query(`SELECT slug, name FROM stylists WHERE active ORDER BY sort, name`)
  ]);
  return {
    date, timeZone: settings.time_zone,
    appointments: appts.rows.map(shape),
    timeOff: off.rows.map(t => ({ id: t.id, startsAt: t.starts_at, endsAt: t.ends_at, reason: t.reason,
                                  stylist: { slug: t.stylist_slug, name: t.stylist_name } })),
    stylists: stylists.rows
  };
}

async function setStatus(code, status) {
  if (!STATUSES.includes(status)) throw new BookingError(400, 'Unknown status');
  code = String(code || '').trim().toUpperCase();
  const settings = await getSettings();
  let row;
  try {
    ({ rows: [row] } = await query(`UPDATE appointments SET status = $2 WHERE code = $1 RETURNING id`, [code, status]));
  } catch (e) {
    // Re-confirming into a slot that has since been taken trips the exclusion constraint.
    if (e.code === '23P01') throw new BookingError(409, 'That time is now taken by another appointment');
    throw e;
  }
  if (!row) throw new BookingError(404, 'No appointment with that code');
  const { rows: [a] } = await query(`${APPT_SELECT} WHERE a.code = $1`, [code]);
  const appt = shape(a);
  let notified = [];
  if (status === 'cancelled') notified = await notify.safely(notify.cancelled(appt, settings.time_zone));
  return { ...appt, notified };
}

async function addTimeOff({ stylist, startsAt, endsAt, reason = '' }) {
  const start = new Date(startsAt), end = new Date(endsAt);
  if (isNaN(start) || isNaN(end) || end <= start) throw new BookingError(400, 'End must be after start');
  const { rows: [st] } = await query('SELECT id FROM stylists WHERE slug = $1', [stylist]);
  if (!st) throw new BookingError(404, 'Unknown stylist');
  const { rows: [t] } = await query(
    `INSERT INTO time_off (stylist_id, starts_at, ends_at, reason) VALUES ($1,$2,$3,$4) RETURNING id`,
    [st.id, start, end, String(reason).slice(0, 200)]
  );
  // Existing bookings aren't moved automatically — surface them so staff can call.
  const { rows: clash } = await query(
    `${APPT_SELECT} WHERE a.stylist_id = $1 AND a.status = 'confirmed' AND a.starts_at < $3 AND a.ends_at > $2`,
    [st.id, start, end]
  );
  return { id: t.id, conflicts: clash.map(shape) };
}

async function removeTimeOff(id) {
  const { rowCount } = await query('DELETE FROM time_off WHERE id = $1', [Number(id)]);
  if (!rowCount) throw new BookingError(404, 'No such time-off block');
  return { ok: true };
}

// ── Team ───────────────────────────────────────────────────────────────────
async function listStylists() {
  const [st, hours, svc] = await Promise.all([
    query('SELECT id, slug, name, title, active, sort FROM stylists ORDER BY sort, name'),
    query('SELECT stylist_id, weekday, start_min, end_min FROM schedules ORDER BY weekday, start_min'),
    query('SELECT ss.stylist_id, s.slug FROM stylist_services ss JOIN services s ON s.id = ss.service_id')
  ]);
  return st.rows.map(s => ({
    slug: s.slug, name: s.name, title: s.title, active: s.active, sort: s.sort,
    hours: hours.rows.filter(h => h.stylist_id === s.id).map(h => ({ weekday: h.weekday, startMin: h.start_min, endMin: h.end_min })),
    services: svc.rows.filter(x => x.stylist_id === s.id).map(x => x.slug)
  }));
}

const slugify = s => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Create or update a stylist, replacing hours and services wholesale.
 * hours: [{weekday 0-6, startMin, endMin}]  services: [slug]
 */
async function saveStylist({ slug, name, title = '', active = true, hours = [], services = [] }) {
  name = String(name || '').trim();
  if (name.length < 1) throw new BookingError(400, 'Name is required');
  for (const h of hours) {
    if (!(h.weekday >= 0 && h.weekday <= 6 && h.startMin >= 0 && h.endMin <= 1440 && h.endMin > h.startMin)) {
      throw new BookingError(400, 'Hours must be within one day, end after start');
    }
  }
  return withTransaction(async (c) => {
    let id;
    if (slug) {
      const { rows: [r] } = await c.query(
        `UPDATE stylists SET name=$2, title=$3, active=$4 WHERE slug=$1 RETURNING id`, [slug, name, title, active]);
      if (!r) throw new BookingError(404, 'Unknown stylist');
      id = r.id;
    } else {
      slug = slugify(name) || 'stylist';
      const { rows: [dup] } = await c.query('SELECT 1 FROM stylists WHERE slug = $1', [slug]);
      if (dup) slug += '-' + Date.now().toString(36).slice(-4);
      const { rows: [r] } = await c.query(
        `INSERT INTO stylists (slug, name, title, active, sort) VALUES ($1,$2,$3,$4, (SELECT COALESCE(MAX(sort),0)+1 FROM stylists)) RETURNING id`,
        [slug, name, title, active]);
      id = r.id;
    }
    await c.query('DELETE FROM schedules WHERE stylist_id = $1', [id]);
    for (const h of hours) {
      await c.query('INSERT INTO schedules (stylist_id, weekday, start_min, end_min) VALUES ($1,$2,$3,$4)', [id, h.weekday, h.startMin, h.endMin]);
    }
    await c.query('DELETE FROM stylist_services WHERE stylist_id = $1', [id]);
    if (services.length) {
      await c.query(
        `INSERT INTO stylist_services (stylist_id, service_id) SELECT $1, id FROM services WHERE slug = ANY($2)`,
        [id, services]);
    }
    return { slug };
  });
}

// ── Reminders (daily cron) ─────────────────────────────────────────────────
// Sends one reminder per confirmed appointment starting within `hours`.
async function sendReminders({ hours = 36, now = new Date() } = {}) {
  const settings = await getSettings();
  const until = new Date(now.getTime() + hours * 3600 * 1000);
  const { rows } = await query(
    `${APPT_SELECT} WHERE a.status = 'confirmed' AND a.reminder_sent_at IS NULL AND a.starts_at > $1 AND a.starts_at <= $2
      ORDER BY a.starts_at`, [now, until]
  );
  const results = [];
  for (const r of rows) {
    const appt = shape(r);
    const sent = await notify.safely(notify.reminder(appt, settings.time_zone));
    await query('UPDATE appointments SET reminder_sent_at = now() WHERE id = $1', [r.id]);
    results.push({ code: appt.code, sent });
  }
  return { count: results.length, results };
}

module.exports = { day, setStatus, addTimeOff, removeTimeOff, listStylists, saveStylist, sendReminders, STATUSES };
