// Booking operations. The API routes are thin wrappers around these so the
// whole flow can be exercised directly in Node against a real database.
const crypto = require('crypto');
const { query, withTransaction, getSettings } = require('./db');
const { computeSlots, isBookable } = require('./availability');
const { localToUtc, utcToLocal, addDays, todayIn } = require('./tz');

class BookingError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

// ── Catalog ────────────────────────────────────────────────────────────────
async function listServices() {
  const [svc, vars] = await Promise.all([
    query(`SELECT id, slug, name, category, description, price_from_cents, duration_min, requires_consult
             FROM services WHERE active ORDER BY sort, name`),
    query(`SELECT id, service_id, name, duration_min FROM service_variations WHERE bookable ORDER BY sort, name`)
  ]);
  const byService = new Map();
  for (const v of vars.rows) {
    if (!byService.has(v.service_id)) byService.set(v.service_id, []);
    byService.get(v.service_id).push({ id: v.id, name: v.name, duration_min: v.duration_min });
  }
  const groups = [];
  for (const r of svc.rows) {
    const variations = byService.get(r.id) || [];
    if (!variations.length) continue;                 // nothing bookable → not offered
    let g = groups.find(x => x.category === r.category);
    if (!g) groups.push(g = { category: r.category, services: [] });
    const { id, ...pub } = r;
    g.services.push({ ...pub, variations });
  }
  return groups;
}

async function getService(slug) {
  const { rows: [s] } = await query('SELECT * FROM services WHERE slug = $1 AND active', [slug]);
  if (!s) throw new BookingError(404, 'Unknown service');
  return s;
}

// The variation being booked. Services with a single bookable variation
// don't need the client to name it; anything else must be explicit.
async function getVariation(service, variationId) {
  const { rows } = await query(
    `SELECT id, name, duration_min FROM service_variations WHERE service_id = $1 AND bookable ORDER BY sort, name`, [service.id]
  );
  if (!rows.length) throw new BookingError(404, 'This service is not bookable online');
  if (variationId == null || variationId === '') {
    if (rows.length === 1) return rows[0];
    throw new BookingError(400, 'Please choose a size or length for this service');
  }
  const v = rows.find(r => r.id === Number(variationId));
  if (!v) throw new BookingError(404, 'That option is not available for this service');
  return v;
}

async function stylistsForService(serviceId) {
  const { rows } = await query(
    `SELECT s.id, s.slug, s.name, s.title
       FROM stylists s JOIN stylist_services ss ON ss.stylist_id = s.id
      WHERE ss.service_id = $1 AND s.active ORDER BY s.sort, s.name`, [serviceId]
  );
  return rows;
}

// ── Availability ───────────────────────────────────────────────────────────
// Everything a stylist has going on for one local day: hours, bookings, time off.
async function dayContext(stylistIds, date, settings) {
  const dayStart = localToUtc(date, 0, settings.time_zone);
  const dayEnd   = localToUtc(addDays(date, 1), 0, settings.time_zone);
  const [hours, appts, off] = await Promise.all([
    query('SELECT stylist_id, weekday, start_min, end_min FROM schedules WHERE stylist_id = ANY($1)', [stylistIds]),
    query(`SELECT stylist_id, starts_at, busy_until FROM appointments
            WHERE stylist_id = ANY($1) AND status = 'confirmed' AND starts_at < $3 AND busy_until > $2`,
          [stylistIds, dayStart, dayEnd]),
    query(`SELECT stylist_id, starts_at, ends_at FROM time_off
            WHERE stylist_id = ANY($1) AND starts_at < $3 AND ends_at > $2`,
          [stylistIds, dayStart, dayEnd])
  ]);
  const ctx = Object.fromEntries(stylistIds.map(id => [id, { hours: [], busy: [] }]));
  for (const h of hours.rows) ctx[h.stylist_id].hours.push({ weekday: h.weekday, startMin: h.start_min, endMin: h.end_min });
  for (const a of appts.rows) ctx[a.stylist_id].busy.push({ start: a.starts_at, end: a.busy_until });
  for (const o of off.rows)   ctx[o.stylist_id].busy.push({ start: o.starts_at, end: o.ends_at });
  return ctx;
}

function assertDateInWindow(date, settings, now) {
  if (!YMD.test(date)) throw new BookingError(400, 'Date must be YYYY-MM-DD');
  const today = todayIn(settings.time_zone, now);
  if (date < today) throw new BookingError(400, 'That date has passed');
  if (date > addDays(today, settings.max_days_ahead)) {
    throw new BookingError(400, `Bookings open up to ${settings.max_days_ahead} days ahead`);
  }
}

/**
 * Slots for a service variation on a date, per stylist plus a merged
 * "any stylist" list.
 */
async function availability({ serviceSlug, variationId = null, date, stylistSlug = null, now = new Date() }) {
  const settings = await getSettings();
  assertDateInWindow(date, settings, now);
  const service = await getService(serviceSlug);
  const variation = await getVariation(service, variationId);
  let stylists = await stylistsForService(service.id);
  if (stylistSlug) {
    stylists = stylists.filter(s => s.slug === stylistSlug);
    if (!stylists.length) throw new BookingError(404, 'That stylist does not offer this service');
  }
  const base = { service: publicService(service), variation, date };
  if (!stylists.length) return { ...base, stylists: [], any: [] };

  const ctx = await dayContext(stylists.map(s => s.id), date, settings);
  const anySet = new Set();
  const perStylist = stylists.map(s => {
    const slots = computeSlots({
      date, tz: settings.time_zone,
      hours: ctx[s.id].hours, busy: ctx[s.id].busy,
      durationMin: variation.duration_min, bufferMin: service.buffer_min,
      stepMin: settings.step_min, leadMin: settings.lead_min, now
    }).map(x => x.start.toISOString());
    slots.forEach(t => anySet.add(t));
    return { slug: s.slug, name: s.name, title: s.title, slots };
  });
  return { ...base, stylists: perStylist, any: [...anySet].sort() };
}

// ── Booking ────────────────────────────────────────────────────────────────
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const newCode = () => 'CH-' + Array.from({ length: 5 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');

function normalizePhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 10) return '1' + d;
  if (d.length === 11 && d[0] === '1') return d;
  throw new BookingError(400, 'Please enter a 10-digit US phone number');
}

function validateClient(c) {
  const name = String(c?.name || '').trim();
  if (name.length < 2 || name.length > 80) throw new BookingError(400, 'Please enter your name');
  const phone = normalizePhone(c?.phone);
  const email = String(c?.email || '').trim().toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BookingError(400, 'That email doesn\'t look right');
  return { name, phone, email };
}

/**
 * Create a confirmed appointment. Re-validates the slot against live data,
 * then relies on the DB exclusion constraint as the final arbiter — so a
 * race between two clients can only ever produce one booking.
 */
async function createAppointment({ serviceSlug, variationId = null, stylistSlug = 'any', startAt, client, notes = '', now = new Date() }) {
  const settings = await getSettings();
  const service = await getService(serviceSlug);
  const variation = await getVariation(service, variationId);
  const start = new Date(startAt);
  if (isNaN(start)) throw new BookingError(400, 'Invalid start time');
  const local = utcToLocal(start, settings.time_zone);
  assertDateInWindow(local.ymd, settings, now);
  const who = validateClient(client);
  notes = String(notes || '').slice(0, 500);

  let candidates = await stylistsForService(service.id);
  if (stylistSlug !== 'any') candidates = candidates.filter(s => s.slug === stylistSlug);
  if (!candidates.length) throw new BookingError(404, 'No stylist offers this service');

  const ctx = await dayContext(candidates.map(s => s.id), local.ymd, settings);
  const stylist = candidates.find(s => isBookable(start, {
    date: local.ymd, tz: settings.time_zone,
    hours: ctx[s.id].hours, busy: ctx[s.id].busy,
    durationMin: variation.duration_min, bufferMin: service.buffer_min,
    leadMin: settings.lead_min, now
  }));
  if (!stylist) throw new BookingError(409, 'That time is no longer available. Please pick another slot.');

  const endsAt    = new Date(start.getTime() + variation.duration_min * 60000);
  const busyUntil = new Date(endsAt.getTime() + service.buffer_min * 60000);

  return withTransaction(async (c) => {
    const { rows: [cl] } = await c.query(
      `INSERT INTO clients (name, phone, email) VALUES ($1, $2, $3)
       ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, email = COALESCE(EXCLUDED.email, clients.email)
       RETURNING id`, [who.name, who.phone, who.email]
    );
    for (let attempt = 0; ; attempt++) {
      const code = newCode();
      try {
        const { rows: [a] } = await c.query(
          `INSERT INTO appointments (code, stylist_id, service_id, variation_id, variation_name, client_id, starts_at, ends_at, busy_until, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, code, starts_at, ends_at`,
          [code, stylist.id, service.id, variation.id, variation.name, cl.id, start, endsAt, busyUntil, notes]
        );
        return {
          code: a.code, startsAt: a.starts_at, endsAt: a.ends_at,
          stylist: { slug: stylist.slug, name: stylist.name },
          service: publicService(service), variation: { id: variation.id, name: variation.name, duration_min: variation.duration_min },
          client: { name: who.name }
        };
      } catch (e) {
        // Only a confirmation-code collision is retryable; a slot collision
        // (23P01, the exclusion constraint) must surface as 409 to the caller.
        if (e.code === '23505' && /code/.test(e.constraint || '') && attempt < 3) continue;
        throw e;
      }
    }
  });
}

async function lookup(code) {
  const { rows: [a] } = await query(
    `SELECT a.code, a.starts_at, a.ends_at, a.status, a.notes, a.variation_name,
            s.name AS service_name, s.slug AS service_slug, s.price_from_cents,
            st.name AS stylist_name, st.slug AS stylist_slug,
            c.name AS client_name, c.phone
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       JOIN stylists st ON st.id = a.stylist_id
       JOIN clients c ON c.id = a.client_id
      WHERE a.code = $1`, [String(code || '').trim().toUpperCase()]
  );
  if (!a) throw new BookingError(404, 'No appointment with that code');
  return {
    code: a.code, startsAt: a.starts_at, endsAt: a.ends_at, status: a.status, notes: a.notes,
    service: { slug: a.service_slug, name: a.service_name, price_from_cents: a.price_from_cents },
    variation: { name: a.variation_name },
    stylist: { slug: a.stylist_slug, name: a.stylist_name },
    client: { name: a.client_name, phoneLast4: a.phone.slice(-4) }
  };
}

async function cancel(code, now = new Date()) {
  const { rows: [a] } = await query(
    `UPDATE appointments SET status = 'cancelled'
      WHERE code = $1 AND status = 'confirmed' AND starts_at > $2
      RETURNING code`, [String(code || '').trim().toUpperCase(), now]
  );
  if (!a) throw new BookingError(409, 'This appointment can\'t be cancelled online (already cancelled, or too close to the start). Please call the salon.');
  return { code: a.code, status: 'cancelled' };
}

function publicService(s) {
  return { slug: s.slug, name: s.name, category: s.category, price_from_cents: s.price_from_cents,
           duration_min: s.duration_min, requires_consult: s.requires_consult };
}

module.exports = { listServices, availability, createAppointment, lookup, cancel, BookingError, normalizePhone };
