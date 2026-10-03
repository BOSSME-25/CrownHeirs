// Visits: several appointments booked together under one confirmation code.
//
// Two shapes, one engine:
//   • a family: several people (the holder and the ones they book for), each
//     with one or more services, seen either "together" (everyone's first
//     service starts within the salon's family window, default 60 min) or
//     on the "same day" (any times that day);
//   • a stack: one person with several services in the order they chose,
//     back to back (loc color, then the retwist). The same stylist may do
//     every leg when they're qualified for each; a leg only ever lands on a
//     stylist who offers that service.
//
// Each leg is still its own appointment row with its own stylist, so the
// double-booking guard, the front desk, the Team Hub push and the ticket's
// provider-per-line all work unchanged. All legs commit together or not at
// all. The holder gets one confirmation, one reminder and one ticket.
const crypto = require('crypto');
const { query, withTransaction, getSettings } = require('./db');
const { computeSlots, isBookable } = require('./availability');
const { utcToLocal, todayIn, addDays } = require('./tz');
const notify = require('./notify');
const teamhub = require('./teamhub');
const booking = require('./booking');
const { BookingError } = booking;
const { getService, getVariation, stylistsForService, dayContext, assertDateInWindow, themeGate, depositForService, paymentLink, validateClient, publicService, CODE_ALPHABET } = booking._internal;

const MAX_PEOPLE = 6, MAX_LEGS = 12;
const MODES = ['together', 'sameday'];
const newCode = () => 'CF-' + Array.from({ length: 5 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
const legCode = () => 'CH-' + Array.from({ length: 5 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
const isVisitCode = code => /^CF-/i.test(String(code || '').trim());

// A person is { name, relationship?, self?, services: [{ service, variation, stylist? }] }.
// The older one-service shape { service, variation, stylist } still works.
async function resolvePeople(people) {
  if (!Array.isArray(people) || !people.length) throw new BookingError(400, 'Who is this visit for?');
  if (people.length > MAX_PEOPLE) throw new BookingError(400, `Up to ${MAX_PEOPLE} people per visit`);
  const out = [];
  let legCount = 0;
  for (const [i, p] of people.entries()) {
    const who = String(p.name || '').trim() || (p.self ? '' : 'Person ' + (i + 1));
    const specs = Array.isArray(p.services) && p.services.length ? p.services : [{ service: p.service || p.serviceSlug, variation: p.variation ?? p.variationId ?? null, stylist: p.stylist, startAt: p.startAt }];
    const legs = [];
    for (const [j, spec] of specs.entries()) {
      const service = await getService(spec.service || spec.serviceSlug);
      const variation = await getVariation(service, spec.variation ?? spec.variationId ?? null);
      let stylists = await stylistsForService(service.id);          // only the qualified
      const want = spec.stylist && spec.stylist !== 'any' ? spec.stylist : null;
      if (want) {
        stylists = stylists.filter(s => s.slug === want);
        if (!stylists.length) throw new BookingError(404, `${who || 'You'}: ${service.name} is not offered by that stylist`);
      }
      if (!stylists.length) throw new BookingError(404, `No stylist offers ${service.name}`);
      legs.push({ j, service, variation, stylists, want, startAt: spec.startAt || null });
      legCount++;
    }
    out.push({ i, self: Boolean(p.self), name: who, relationship: String(p.relationship || '').trim().slice(0, 40), legs });
  }
  if (legCount < 2) throw new BookingError(400, 'A visit needs at least two appointments: add a person or another service');
  if (legCount > MAX_LEGS) throw new BookingError(400, `Up to ${MAX_LEGS} appointments per visit`);
  return out;
}

const spanOf = (leg, t) => ({ start: t, end: t + (leg.variation.duration_min + leg.service.buffer_min) * 60000 });
const endOf = (leg, t) => t + leg.variation.duration_min * 60000;

// Can `stylist` take `leg` at `t`, given the day and what this visit has already claimed?
function legFits(leg, s, t, ctx, settings, now, picked) {
  const mine = picked.filter(q => q.s.id === s.id).map(q => ({ start: new Date(q.start), end: new Date(q.end) }));
  return isBookable(new Date(t), {
    date: ctx.date, tz: settings.time_zone, hours: ctx[s.id].hours, busy: [...ctx[s.id].busy, ...mine],
    durationMin: leg.variation.duration_min, bufferMin: leg.service.buffer_min, leadMin: settings.lead_min, now
  });
}

// Place one person's legs back to back from `t0`, trying each qualified
// stylist per leg. Appends to `picked` on success.
function placePerson(p, t0, ctx, settings, now, picked) {
  const mark = picked.length;
  const step = (k, t) => {
    if (k === p.legs.length) return true;
    const leg = p.legs[k];
    for (const s of leg.stylists) {
      if (!legFits(leg, s, t, ctx, settings, now, picked)) continue;
      picked.push({ p, leg, s, start: t, end: spanOf(leg, t).end, serviceEnd: endOf(leg, t) });
      if (step(k + 1, endOf(leg, t))) return true;       // the next service starts when this one ends
      picked.pop();
    }
    return false;
  };
  if (step(0, t0)) return true;
  picked.length = mark;
  return false;
}

/**
 * Times when the whole visit fits on `date`.
 *   mode 'together': everyone's first appointment starts within the family window.
 *   mode 'sameday':  everyone is seen that day, at whatever times fit.
 * → { date, mode, windowMin, options: [{ startAt, endsAt, people: [{ name, legs: [...] }] }] }
 */
async function availability({ people, date, mode = 'together', staff = false, now = new Date(), limit = 60 }) {
  const settings = await getSettings();
  if (staff) settings.lead_min = 0;
  await assertDateInWindow(date, settings, now);
  if (!MODES.includes(mode)) throw new BookingError(400, 'mode must be together or sameday');
  const ppl = await resolvePeople(people);
  const ids = [...new Set(ppl.flatMap(p => p.legs.flatMap(l => l.stylists.map(s => s.id))))];
  const ctx = await dayContext(ids, date, settings); ctx.date = date;
  const windowMs = (mode === 'together' ? (settings.family_window_min || 60) : 24 * 60) * 60000;

  // Candidate starts for each person's first leg, per stylist (on the 15-min grid).
  const firstStarts = p => [...new Set(p.legs[0].stylists.flatMap(s => computeSlots({
    date, tz: settings.time_zone, hours: ctx[s.id].hours, busy: ctx[s.id].busy,
    durationMin: p.legs[0].variation.duration_min, bufferMin: p.legs[0].service.buffer_min,
    stepMin: settings.step_min, leadMin: settings.lead_min, now
  }).map(x => x.start.getTime())))].sort((a, b) => a - b);
  const starts = ppl.map(firstStarts);

  const options = [];
  for (const T of starts[0]) {
    const picked = [];
    const tryPerson = (i) => {
      if (i === ppl.length) return true;
      for (const t of starts[i]) {
        if (t < T || t > T + windowMs) continue;
        if (!placePerson(ppl[i], t, ctx, settings, now, picked)) continue;
        if (tryPerson(i + 1)) return true;
        while (picked.length && picked[picked.length - 1].p === ppl[i]) picked.pop();   // undo this person's legs
      }
      return false;
    };
    if (!tryPerson(0)) continue;
    options.push(shapeOption(ppl, picked));
    if (options.length >= limit) break;
  }
  return { date, mode, windowMin: mode === 'together' ? (settings.family_window_min || 60) : null, options };
}

function shapeOption(ppl, picked) {
  const people = ppl.map(p => ({
    name: p.name, self: p.self,
    legs: picked.filter(q => q.p === p).map(q => ({
      service: publicService(q.leg.service), variation: { id: q.leg.variation.id, name: q.leg.variation.name, duration_min: q.leg.variation.duration_min },
      stylist: { slug: q.s.slug, name: q.s.name }, startAt: new Date(q.start).toISOString(), endsAt: new Date(q.serviceEnd).toISOString()
    }))
  }));
  const all = people.flatMap(p => p.legs);
  return { startAt: all.map(l => l.startAt).sort()[0], endsAt: all.map(l => l.endsAt).sort().slice(-1)[0], people };
}

/** The first day (from today, within the booking window) with any option in `mode`. */
async function soonest({ people, mode = 'together', from = null, staff = false, now = new Date() }) {
  const settings = await getSettings();
  if (staff) settings.lead_min = 0;
  const themes = require('./themes');
  const today = todayIn(settings.time_zone, now);
  const latest = await themes.latestBookable(settings, now);
  let d = from && from > today ? from : today;
  for (; d <= latest; d = addDays(d, 1)) {
    const a = await availability({ people, date: d, mode, staff, now, limit: 1 });
    if (a.options.length) return { date: d, mode, option: a.options[0] };
  }
  return { date: null, mode, option: null };
}

/**
 * Book a visit. Each person's legs carry stylist and startAt as returned
 * by availability. All legs commit together or not at all.
 */
async function create({ holder, people, notes = '', mode = 'together', staff = false, themeAck = false, policyAck = false, now = new Date() }) {
  const settings = await getSettings();
  if (staff) settings.lead_min = 0;
  const source = staff ? 'staff' : 'online';
  const who = validateClient(holder);
  notes = String(notes || '').slice(0, 500);
  const ppl = await resolvePeople(people);
  for (const p of ppl) {
    if (!p.name && !p.self) throw new BookingError(400, 'Everyone needs a name');
    if (p.self) p.name = who.name;
    for (const leg of p.legs) {
      if (!leg.want) throw new BookingError(400, `${p.name}: pick a time first`);   // availability names a stylist per leg
      leg.start = new Date(leg.startAt);
      if (isNaN(leg.start)) throw new BookingError(400, `${p.name}: invalid start time`);
    }
    for (let k = 1; k < p.legs.length; k++) {                                       // back to back, in order
      const prevEnd = endOf(p.legs[k - 1], p.legs[k - 1].start.getTime());
      if (p.legs[k].start.getTime() !== prevEnd) throw new BookingError(400, `${p.name}: ${p.legs[k].service.name} must start when ${p.legs[k - 1].service.name} ends`);
    }
  }
  const firsts = ppl.map(p => p.legs[0].start.getTime());
  const date = utcToLocal(new Date(Math.min(...firsts)), settings.time_zone).ymd;
  await assertDateInWindow(date, settings, now);
  if (mode === 'together') {
    const windowMs = (settings.family_window_min || 60) * 60000;
    if (Math.max(...firsts) - Math.min(...firsts) > windowMs) throw new BookingError(400, `Everyone's first appointment must start within ${settings.family_window_min} minutes`);
  }
  for (const p of ppl) for (const leg of p.legs) {
    if (utcToLocal(leg.start, settings.time_zone).ymd !== date) throw new BookingError(400, 'Every appointment in a visit must be on the same day');
  }
  const gate = await themeGate(date, { family: ppl.length > 1, categories: ppl.flatMap(p => p.legs.map(l => l.service.category)), themeAck, staff });
  const policy = require('./policy');
  for (const p of ppl) for (const leg of p.legs) leg.deposit = depositForService(leg.service, settings);
  const depositTotal = ppl.reduce((a, p) => a + p.legs.reduce((b, l) => b + l.deposit, 0), 0);
  if (!staff && !policyAck) throw new BookingError(400, 'Please accept the booking policy to continue.', { needsPolicyAck: true, terms: policy.terms(settings, depositTotal), deposit_cents: depositTotal });

  // Re-check every leg against the live book, and against each other.
  const ids = [...new Set(ppl.flatMap(p => p.legs.map(l => l.stylists[0].id)))];
  const ctx = await dayContext(ids, date, settings); ctx.date = date;
  const picked = [];
  for (const p of ppl) for (const leg of p.legs) {
    const s = leg.stylists[0];
    if (!legFits(leg, s, leg.start.getTime(), ctx, settings, now, picked)) {
      throw new BookingError(409, `${p.name}'s ${leg.service.name} with ${s.name} is no longer available. Please pick another time.`);
    }
    picked.push({ p, leg, s, start: leg.start.getTime(), end: spanOf(leg, leg.start.getTime()).end, serviceEnd: endOf(leg, leg.start.getTime()) });
  }

  const visit = await withTransaction(async (c) => {
    const { rows: [h] } = await c.query(
      `INSERT INTO clients (name, phone, email) VALUES ($1, $2, $3)
       ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, email = COALESCE(EXCLUDED.email, clients.email)
       RETURNING id, household_id`, [who.name, who.phone, who.email]);
    const family = ppl.length > 1;
    let householdId = h.household_id;
    if (family && !householdId) {
      const { rows: [hh] } = await c.query(`INSERT INTO households (holder_id) VALUES ($1) RETURNING id`, [h.id]);
      householdId = hh.id;
      await c.query(`UPDATE clients SET household_id = $1 WHERE id = $2`, [householdId, h.id]);
    }
    for (const p of ppl) {
      if (p.self || p.name.toLowerCase() === who.name.toLowerCase()) { p.clientId = h.id; continue; }
      const { rows: [d] } = await c.query(`SELECT id FROM clients WHERE household_id = $1 AND lower(name) = lower($2) ORDER BY id LIMIT 1`, [householdId, p.name]);
      if (d) { p.clientId = d.id; if (p.relationship) await c.query(`UPDATE clients SET relationship = $1 WHERE id = $2`, [p.relationship, d.id]); continue; }
      const { rows: [n] } = await c.query(`INSERT INTO clients (name, phone, household_id, relationship) VALUES ($1, NULL, $2, $3) RETURNING id`, [p.name, householdId, p.relationship]);
      p.clientId = n.id;
    }
    let v;
    for (let i = 0; ; i++) {
      try {
        ({ rows: [v] } = await c.query(
          `INSERT INTO visits (code, holder_id, household_id, kind, notes, source) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, code, created_at`,
          [newCode(), h.id, householdId, family ? 'family' : 'combo', notes, source]));
        break;
      } catch (e) { if (e.code === '23505' && i < 3) continue; throw e; }
    }
    const legs = [];
    for (const q of picked) {
      let a;
      for (let i = 0; ; i++) {
        try {
          ({ rows: [a] } = await c.query(
            `INSERT INTO appointments (code, visit_id, stylist_id, service_id, variation_id, variation_name, client_id, starts_at, ends_at, busy_until, notes, source, theme_id, theme_fit, theme_ack, deposit_cents, deposit_status, policy_ack)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING code, starts_at, ends_at`,
            [legCode(), v.id, q.s.id, q.leg.service.id, q.leg.variation.id, q.leg.variation.name, q.p.clientId, new Date(q.start), new Date(q.serviceEnd), new Date(q.end), '', source,
             gate.theme ? gate.theme.id : null, gate.fit, Boolean(themeAck), q.leg.deposit, q.leg.deposit > 0 ? 'due' : 'none', Boolean(policyAck) || staff]));
          break;
        } catch (e) {
          if (e.code === '23505' && /code/.test(e.constraint || '') && i < 3) continue;
          if (e.code === '23P01') throw new BookingError(409, `${q.p.name}'s ${q.leg.service.name} with ${q.s.name} was just taken. Please pick another time.`);
          throw e;
        }
      }
      legs.push({ code: a.code, name: q.p.name, clientId: q.p.clientId, startsAt: a.starts_at, endsAt: a.ends_at,
        service: publicService(q.leg.service), variation: { id: q.leg.variation.id, name: q.leg.variation.name, duration_min: q.leg.variation.duration_min },
        stylist: { slug: q.s.slug, name: q.s.name, email: q.s.email } });
    }
    return { code: v.code, kind: family ? 'family' : 'combo', createdAt: v.created_at, legs };
  });

  const shaped = { code: visit.code, kind: visit.kind, status: 'confirmed', notes, source, mode,
    holder: { name: who.name, phone: who.phone, email: who.email }, people: visit.legs,
    theme: gate.theme ? { id: gate.theme.id, name: gate.theme.name, headline: gate.theme.headline, body: gate.theme.body, fit: gate.fit } : null,
    deposit: { cents: depositTotal, status: depositTotal > 0 ? 'due' : 'none', terms: policy.terms(settings, depositTotal) } };
  if (depositTotal > 0) {
    const link = await paymentLink({ amountCents: depositTotal, code: visit.code, name: `${visit.legs.length} appointments`, who: who.name });
    if (link && link.url) { shaped.deposit.payUrl = link.url; await query(`UPDATE visits SET pay_url = $2, pay_ref = $3 WHERE code = $1`, [visit.code, link.url, link.orderId]); }
    else if (link && link.error) shaped.deposit.linkError = link.error;
  }
  shaped.notified = await notify.safely(notify.familyBooked(shaped, settings.time_zone));
  shaped.hub = [];
  for (const leg of visit.legs) {
    shaped.hub.push(await teamhub.syncAndRecord({ ...leg, status: 'confirmed', notes: `Visit ${visit.code}`, client: { name: leg.name, phone: who.phone, email: who.email } }));
  }
  return shaped;
}

const VISIT_SQL = `
  SELECT v.code, v.kind, v.notes, v.source, v.created_at, v.household_id, v.pay_url, v.pay_ref,
         h.name AS holder_name, h.phone AS holder_phone, h.email AS holder_email, h.fee_waived,
         a.code AS leg_code, a.starts_at, a.ends_at, a.status, a.variation_name, a.deposit_cents, a.deposit_status,
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
    deposit: { cents: r.deposit_cents, status: r.deposit_status },
    service: { slug: r.service_slug, name: r.service_name, price_from_cents: r.price_from_cents },
    variation: { name: r.variation_name }, stylist: { slug: r.stylist_slug, name: r.stylist_name, email: r.stylist_email }
  }));
  const status = legs.every(l => l.status === 'cancelled') ? 'cancelled' : legs.some(l => l.status === 'confirmed') ? 'confirmed' : legs[0].status;
  const due = legs.filter(l => l.deposit.status === 'due').reduce((a, l) => a + l.deposit.cents, 0);
  const total = legs.reduce((a, l) => a + l.deposit.cents, 0);
  const depStatus = total === 0 ? 'none' : due > 0 ? 'due' : legs.some(l => l.deposit.status === 'paid') ? 'paid' : legs[0].deposit.status;
  return { code: v.code, kind: v.kind, status, notes: v.notes, source: v.source, createdAt: v.created_at,
           startsAt: legs.map(l => l.startsAt).sort()[0],
           holder: { name: v.holder_name, phone: v.holder_phone, email: v.holder_email, feeWaived: v.fee_waived }, people: legs,
           deposit: { cents: total, due, status: depStatus, payUrl: due > 0 ? v.pay_url : null, ref: v.pay_ref } };
}
// A visit's deposit paid through its Square link marks every due leg paid.
async function refreshDeposit(v) {
  if (v.deposit.status !== 'due' || !v.deposit.ref) return v;
  try {
    const paid = await require('./square').orderPaid(v.deposit.ref);
    if (paid) { await query(`UPDATE appointments SET deposit_status = 'paid', deposit_paid_at = now() WHERE deposit_status = 'due' AND visit_id = (SELECT id FROM visits WHERE code = $1)`, [v.code]); return load(v.code); }
  } catch (e) { /* still due */ }
  return v;
}

async function lookup(code) {
  const v = await refreshDeposit(await load(code));
  const settings = await getSettings();
  const policy = require('./policy');
  const late = v.status === 'confirmed' && policy.isLateCancel(v.startsAt, settings);
  return { ...v, holder: { name: v.holder.name, phoneLast4: String(v.holder.phone || '').slice(-4) },
    cancelLate: late, cancelForfeits: late && !v.holder.feeWaived && v.people.some(l => l.deposit.status === 'paid'), terms: policy.terms(settings, v.deposit.cents) };
}

async function cancel(code, now = new Date()) {
  const v = await load(code);
  const settings = await getSettings();
  const policy = require('./policy');
  const late = policy.isLateCancel(v.startsAt, settings, now);
  const forfeit = late && !v.holder.feeWaived;
  const { rows } = await query(
    `UPDATE appointments SET status = 'cancelled', cancelled_at = now(), late_cancel = $3,
            deposit_status = CASE WHEN deposit_status = 'paid' AND $4 THEN 'forfeited' WHEN deposit_status = 'due' THEN 'none' ELSE deposit_status END
      WHERE visit_id = (SELECT id FROM visits WHERE code = $1) AND status = 'confirmed' AND starts_at > $2
      RETURNING code, deposit_status`, [v.code, now, late, forfeit]);
  if (!rows.length) throw new BookingError(409, 'This visit can\'t be cancelled online (already cancelled, or too close to the start). Please call the salon.');
  const forfeited = rows.filter(r => r.deposit_status === 'forfeited').length > 0;
  const cancelledCodes = new Set(rows.map(r => r.code));
  const shaped = { ...v, status: 'cancelled', lateCancel: late, deposit: { ...v.deposit, forfeited }, people: v.people.map(l => cancelledCodes.has(l.code) ? { ...l, status: 'cancelled' } : l) };
  const notified = await notify.safely(notify.familyCancelled(shaped, settings.time_zone));
  const hub = [];
  for (const leg of shaped.people) {
    if (!cancelledCodes.has(leg.code)) continue;
    hub.push(await teamhub.syncAndRecord({ ...leg, notes: `Visit ${v.code}`, client: { name: leg.name, phone: v.holder.phone, email: v.holder.email } }));
  }
  return { code: v.code, status: 'cancelled', lateCancel: late, deposit: shaped.deposit, cancelled: [...cancelledCodes], notified, hub };
}

module.exports = { availability, soonest, create, lookup, cancel, load, isVisitCode, MAX_PEOPLE, MAX_LEGS, MODES };
