// Family bookings: one visit, several people, one confirmation code.
//
// The holder (a parent, say) books under their own name and phone and adds
// the others by first name. Each person gets their own appointment row with
// their own stylist, so the double-booking guard, the front desk, the Team
// Hub push and the ticket's provider-per-line all work unchanged. The
// appointments all start within the salon's family window (default 60 min),
// and the holder gets one confirmation, one reminder and one ticket.
const crypto = require('crypto');
const { query, withTransaction, getSettings } = require('./db');
const { computeSlots, isBookable } = require('./availability');
const { utcToLocal } = require('./tz');
const notify = require('./notify');
const teamhub = require('./teamhub');
const booking = require('./booking');
const { BookingError, normalizePhone } = booking;
const { getService, getVariation, stylistsForService, dayContext, assertDateInWindow, themeGate, validateClient, publicService, CODE_ALPHABET } = booking._internal;

const MAX_PEOPLE = 6;
const newCode = () => 'CF-' + Array.from({ length: 5 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
const isVisitCode = code => /^CF-/i.test(String(code || '').trim());

// Resolve each person's service, option and candidate stylists.
async function resolvePeople(people) {
  if (!Array.isArray(people) || people.length < 2) throw new BookingError(400, 'A family booking needs at least two people');
  if (people.length > MAX_PEOPLE) throw new BookingError(400, `Up to ${MAX_PEOPLE} people per visit`);
  const out = [];
  for (const [i, p] of people.entries()) {
    const service = await getService(p.service || p.serviceSlug);
    const variation = await getVariation(service, p.variation ?? p.variationId ?? null);
    let stylists = await stylistsForService(service.id);
    const want = p.stylist && p.stylist !== 'any' ? p.stylist : null;
    if (want) {
      stylists = stylists.filter(s => s.slug === want);
      if (!stylists.length) throw new BookingError(404, `${p.name || 'Person ' + (i + 1)}: that stylist does not offer this service`);
    }
    if (!stylists.length) throw new BookingError(404, `No stylist offers ${service.name}`);
    out.push({ self: Boolean(p.self), name: String(p.name || '').trim(), relationship: String(p.relationship || '').trim().slice(0, 40), service, variation, stylists, want });
  }
  return out;
}

const overlaps = (a, b) => a.start < b.end && b.start < a.end;

/**
 * Times when everyone can be seen within the family window.
 * Returns { options: [{ startAt, people: [{ name, stylist, startAt, endsAt }] }] },
 * one option per earliest start, each a concrete stylist for every person.
 */
async function availability({ people, date, staff = false, now = new Date() }) {
  const settings = await getSettings();
  if (staff) settings.lead_min = 0;
  await assertDateInWindow(date, settings, now);
  const ppl = await resolvePeople(people);
  const ids = [...new Set(ppl.flatMap(p => p.stylists.map(s => s.id)))];
  const ctx = await dayContext(ids, date, settings);
  const windowMs = (settings.family_window_min || 60) * 60000;

  // Every (person, stylist) → that stylist's open starts for that person's service.
  const slotsFor = (p, s) => computeSlots({
    date, tz: settings.time_zone, hours: ctx[s.id].hours, busy: ctx[s.id].busy,
    durationMin: p.variation.duration_min, bufferMin: p.service.buffer_min,
    stepMin: settings.step_min, leadMin: settings.lead_min, now
  }).map(x => x.start.getTime());
  const table = ppl.map(p => p.stylists.map(s => ({ s, starts: slotsFor(p, s) })));

  // Candidate visit starts: the first person's open starts.
  const starts = [...new Set(table[0].flatMap(x => x.starts))].sort((a, b) => a - b);
  const options = [];
  for (const T of starts) {
    const picked = [];                              // { s, start, end } per person, in order
    const tryPerson = (i) => {
      if (i === ppl.length) return true;
      const p = ppl[i];
      for (const { s, starts: st } of table[i]) {
        for (const t of st) {
          if (t < T || t > T + windowMs) continue;
          const end = t + (p.variation.duration_min + p.service.buffer_min) * 60000;
          const span = { start: t, end };
          if (picked.some(q => q.s.id === s.id && overlaps(q, span))) continue;   // one chair at a time
          picked.push({ s, start: t, end });
          if (tryPerson(i + 1)) return true;
          picked.pop();
        }
      }
      return false;
    };
    if (!tryPerson(0)) continue;
    options.push({
      startAt: new Date(T).toISOString(),
      people: picked.map((q, i) => ({
        name: ppl[i].name, service: publicService(ppl[i].service), variation: { id: ppl[i].variation.id, name: ppl[i].variation.name, duration_min: ppl[i].variation.duration_min },
        stylist: { slug: q.s.slug, name: q.s.name },
        startAt: new Date(q.start).toISOString(),
        endsAt: new Date(q.start + ppl[i].variation.duration_min * 60000).toISOString()
      }))
    });
    if (options.length >= 60) break;
  }
  return { date, windowMin: settings.family_window_min || 60, options };
}

/**
 * Book a visit. `people[i]` carries name, service, variation, stylist and
 * startAt (as returned by availability). All legs commit together or not at all.
 */
async function create({ holder, people, notes = '', staff = false, themeAck = false, now = new Date() }) {
  const settings = await getSettings();
  if (staff) settings.lead_min = 0;
  const source = staff ? 'staff' : 'online';
  const who = validateClient(holder);
  notes = String(notes || '').slice(0, 500);
  const ppl = await resolvePeople(people);
  for (const [i, p] of ppl.entries()) {
    if (!p.name) throw new BookingError(400, `Person ${i + 1} needs a name`);
    if (!p.want) throw new BookingError(400, `${p.name}: pick a time first`);   // availability names a stylist per person
    p.start = new Date(people[i].startAt);
    if (isNaN(p.start)) throw new BookingError(400, `${p.name}: invalid start time`);
  }
  const date = utcToLocal(ppl[0].start, settings.time_zone).ymd;
  await assertDateInWindow(date, settings, now);
  const gate = await themeGate(date, { family: true, categories: ppl.map(p => p.service.category), themeAck, staff });
  const windowMs = (settings.family_window_min || 60) * 60000;
  const t0 = Math.min(...ppl.map(p => p.start.getTime())), t1 = Math.max(...ppl.map(p => p.start.getTime()));
  if (t1 - t0 > windowMs) throw new BookingError(400, `Everyone's appointment must start within ${settings.family_window_min} minutes`);

  // Re-check every leg against the live book (and against each other).
  const ids = [...new Set(ppl.map(p => p.stylists[0].id))];
  const ctx = await dayContext(ids, date, settings);
  const taken = [];
  for (const p of ppl) {
    const s = p.stylists[0];
    const ok = isBookable(p.start, { date, tz: settings.time_zone, hours: ctx[s.id].hours, busy: [...ctx[s.id].busy, ...taken.filter(x => x.sid === s.id)],
      durationMin: p.variation.duration_min, bufferMin: p.service.buffer_min, leadMin: settings.lead_min, now });
    if (!ok) throw new BookingError(409, `${p.name}'s time with ${s.name} is no longer available. Please pick another time.`);
    p.end = new Date(p.start.getTime() + p.variation.duration_min * 60000);
    p.busyUntil = new Date(p.end.getTime() + p.service.buffer_min * 60000);
    taken.push({ sid: s.id, start: p.start, end: p.busyUntil });
  }

  const visit = await withTransaction(async (c) => {
    // Holder: a normal client with a phone. Their household is created on first family booking.
    const { rows: [h] } = await c.query(
      `INSERT INTO clients (name, phone, email) VALUES ($1, $2, $3)
       ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, email = COALESCE(EXCLUDED.email, clients.email)
       RETURNING id, household_id`, [who.name, who.phone, who.email]);
    let householdId = h.household_id;
    if (!householdId) {
      const { rows: [hh] } = await c.query(`INSERT INTO households (holder_id) VALUES ($1) RETURNING id`, [h.id]);
      householdId = hh.id;
      await c.query(`UPDATE clients SET household_id = $1 WHERE id = $2`, [householdId, h.id]);
    }
    // Each person: the holder themselves, or a dependent matched by name in the household.
    for (const p of ppl) {
      if (p.name.toLowerCase() === who.name.toLowerCase() || p.self) { p.clientId = h.id; continue; }
      const { rows: [d] } = await c.query(
        `SELECT id FROM clients WHERE household_id = $1 AND lower(name) = lower($2) ORDER BY id LIMIT 1`, [householdId, p.name]);
      if (d) { p.clientId = d.id; if (p.relationship) await c.query(`UPDATE clients SET relationship = $1 WHERE id = $2`, [p.relationship, d.id]); continue; }
      const { rows: [n] } = await c.query(
        `INSERT INTO clients (name, phone, household_id, relationship) VALUES ($1, NULL, $2, $3) RETURNING id`, [p.name, householdId, p.relationship]);
      p.clientId = n.id;
    }
    let v;
    for (let i = 0; ; i++) {
      try {
        ({ rows: [v] } = await c.query(
          `INSERT INTO visits (code, holder_id, household_id, kind, notes, source) VALUES ($1,$2,$3,'family',$4,$5) RETURNING id, code, created_at`,
          [newCode(), h.id, householdId, notes, source]));
        break;
      } catch (e) { if (e.code === '23505' && i < 3) continue; throw e; }
    }
    const legs = [];
    for (const p of ppl) {
      const s = p.stylists[0];
      let a;
      for (let i = 0; ; i++) {
        try {
          ({ rows: [a] } = await c.query(
            `INSERT INTO appointments (code, visit_id, stylist_id, service_id, variation_id, variation_name, client_id, starts_at, ends_at, busy_until, notes, source, theme_id, theme_fit, theme_ack)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING code, starts_at, ends_at`,
            ['CH-' + Array.from({ length: 5 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join(''),
             v.id, s.id, p.service.id, p.variation.id, p.variation.name, p.clientId, p.start, p.end, p.busyUntil, '', source,
             gate.theme ? gate.theme.id : null, gate.fit, Boolean(themeAck)]));
          break;
        } catch (e) {
          if (e.code === '23505' && /code/.test(e.constraint || '') && i < 3) continue;
          if (e.code === '23P01') throw new BookingError(409, `${p.name}'s time with ${s.name} was just taken. Please pick another time.`);
          throw e;
        }
      }
      legs.push({ code: a.code, name: p.name, clientId: p.clientId, startsAt: a.starts_at, endsAt: a.ends_at,
        service: publicService(p.service), variation: { id: p.variation.id, name: p.variation.name, duration_min: p.variation.duration_min },
        stylist: { slug: s.slug, name: s.name, email: s.email } });
    }
    return { code: v.code, createdAt: v.created_at, legs };
  });

  const shaped = { code: visit.code, status: 'confirmed', notes, source, holder: { name: who.name, phone: who.phone, email: who.email }, people: visit.legs,
    theme: gate.theme ? { id: gate.theme.id, name: gate.theme.name, headline: gate.theme.headline, body: gate.theme.body, fit: gate.fit } : null };
  shaped.notified = await notify.safely(notify.familyBooked(shaped, settings.time_zone));
  // Team Hub: each leg is its own appointment under its own stylist.
  shaped.hub = [];
  for (const leg of visit.legs) {
    shaped.hub.push(await teamhub.syncAndRecord({ ...leg, status: 'confirmed', notes: `Family visit ${visit.code}`, client: { name: leg.name, phone: who.phone, email: who.email } }));
  }
  return shaped;
}

const VISIT_SQL = `
  SELECT v.code, v.notes, v.source, v.created_at, v.household_id,
         h.name AS holder_name, h.phone AS holder_phone, h.email AS holder_email,
         a.code AS leg_code, a.starts_at, a.ends_at, a.status, a.variation_name,
         s.name AS service_name, s.slug AS service_slug, s.price_from_cents,
         st.slug AS stylist_slug, st.name AS stylist_name, st.email AS stylist_email,
         c.name AS person_name, c.relationship
    FROM visits v
    JOIN clients h ON h.id = v.holder_id
    JOIN appointments a ON a.visit_id = v.id
    JOIN services s ON s.id = a.service_id
    JOIN stylists st ON st.id = a.stylist_id
    JOIN clients c ON c.id = a.client_id
   WHERE v.code = $1
   ORDER BY a.starts_at, a.id`;

async function load(code) {
  const { rows } = await query(VISIT_SQL, [String(code || '').trim().toUpperCase()]);
  if (!rows.length) throw new BookingError(404, 'No visit with that code');
  const v = rows[0];
  const legs = rows.map(r => ({
    code: r.leg_code, startsAt: r.starts_at, endsAt: r.ends_at, status: r.status, name: r.person_name, relationship: r.relationship,
    service: { slug: r.service_slug, name: r.service_name, price_from_cents: r.price_from_cents },
    variation: { name: r.variation_name }, stylist: { slug: r.stylist_slug, name: r.stylist_name, email: r.stylist_email }
  }));
  const status = legs.every(l => l.status === 'cancelled') ? 'cancelled' : legs.some(l => l.status === 'confirmed') ? 'confirmed' : legs[0].status;
  return { code: v.code, status, notes: v.notes, source: v.source, createdAt: v.created_at,
           startsAt: legs.map(l => l.startsAt).sort()[0],
           holder: { name: v.holder_name, phone: v.holder_phone, email: v.holder_email }, people: legs };
}

// Public view: the holder's phone reduced to its last four digits.
async function lookup(code) {
  const v = await load(code);
  return { ...v, holder: { name: v.holder.name, phoneLast4: String(v.holder.phone || '').slice(-4) } };
}

// Cancel every leg still to come. One message to the holder; each leg to the hub.
async function cancel(code, now = new Date()) {
  const v = await load(code);
  const { rows } = await query(
    `UPDATE appointments SET status = 'cancelled'
      WHERE visit_id = (SELECT id FROM visits WHERE code = $1) AND status = 'confirmed' AND starts_at > $2
      RETURNING code`, [v.code, now]);
  if (!rows.length) throw new BookingError(409, 'This visit can\'t be cancelled online (already cancelled, or too close to the start). Please call the salon.');
  const settings = await getSettings();
  const cancelledCodes = new Set(rows.map(r => r.code));
  const shaped = { ...v, status: 'cancelled', people: v.people.map(l => cancelledCodes.has(l.code) ? { ...l, status: 'cancelled' } : l) };
  const notified = await notify.safely(notify.familyCancelled(shaped, settings.time_zone));
  const hub = [];
  for (const leg of shaped.people) {
    if (!cancelledCodes.has(leg.code)) continue;
    hub.push(await teamhub.syncAndRecord({ ...leg, notes: `Family visit ${v.code}`, client: { name: leg.name, phone: v.holder.phone, email: v.holder.email } }));
  }
  return { code: v.code, status: 'cancelled', cancelled: [...cancelledCodes], notified, hub };
}

module.exports = { availability, create, lookup, cancel, load, isVisitCode, MAX_PEOPLE };
