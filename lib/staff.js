// Staff-side operations behind the admin password: the day's book, status
// changes, time off, and the team roster with hours and services.
const { query, withTransaction, getSettings } = require('./db');
const { localToUtc, utcToLocal, addDays, todayIn } = require('./tz');
const { BookingError } = require('./booking');
const { isBookable } = require('./availability');
const dayContext = (...a) => require('./booking')._internal.dayContext(...a);
const notify = require('./notify');
const teamhub = require('./teamhub');

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = ['confirmed', 'cancelled', 'completed', 'no_show'];

const APPT_SELECT = `
  SELECT a.id, a.code, a.starts_at, a.ends_at, a.status, a.notes, a.source, a.variation_name, a.created_at,
         a.hub_synced_at, a.hub_error, a.theme_fit, a.theme_ack, a.moved_from, th.name AS theme_name,
         a.deposit_cents, a.deposit_status, a.deposit_ref, a.deposit_paid_at, a.policy_ack, a.late_cancel, c.fee_waived,
         s.name AS service_name, s.slug AS service_slug, s.price_from_cents,
         st.name AS stylist_name, st.slug AS stylist_slug, st.email AS stylist_email,
         c.name AS client_name, c.phone, c.email, c.relationship,
         v.code AS visit_code, v.kind AS visit_kind, hc.name AS holder_name, hc.phone AS holder_phone, hc.email AS holder_email,
         tk.code AS ticket_code, tk.status AS ticket_status, tk.total_cents AS ticket_total, tk.tip_cents AS ticket_tip
    FROM appointments a
    JOIN services s ON s.id = a.service_id
    JOIN stylists st ON st.id = a.stylist_id
    JOIN clients c ON c.id = a.client_id
    LEFT JOIN day_themes th ON th.id = a.theme_id
    LEFT JOIN visits v ON v.id = a.visit_id
    LEFT JOIN clients hc ON hc.id = v.holder_id
    LEFT JOIN tickets tk ON (tk.appointment_id = a.id OR (a.visit_id IS NOT NULL AND tk.visit_id = a.visit_id)) AND tk.status <> 'voided'`;

const shape = a => ({
  code: a.code, startsAt: a.starts_at, endsAt: a.ends_at, status: a.status, notes: a.notes,
  source: a.source, createdAt: a.created_at,
  hub: { syncedAt: a.hub_synced_at || null, error: a.hub_error || null },
  ticket: a.ticket_code ? { code: a.ticket_code, status: a.ticket_status, total_cents: a.ticket_total, tip_cents: a.ticket_tip } : null,
  service: { slug: a.service_slug, name: a.service_name, price_from_cents: a.price_from_cents },
  variation: { name: a.variation_name },
  stylist: { slug: a.stylist_slug, name: a.stylist_name, email: a.stylist_email || null },
  client: { name: a.client_name, phone: a.phone || a.holder_phone || null, email: a.email || a.holder_email || null, relationship: a.relationship || '' },
  visit: a.visit_code ? { code: a.visit_code, kind: a.visit_kind, holder: { name: a.holder_name, phone: a.holder_phone } } : null,
  theme: a.theme_name ? { name: a.theme_name, fit: a.theme_fit, ack: a.theme_ack } : null,
  movedFrom: a.moved_from || null,
  deposit: { cents: a.deposit_cents, status: a.deposit_status, ref: a.deposit_ref || null, paidAt: a.deposit_paid_at || null },
  policyAck: a.policy_ack, lateCancel: a.late_cancel, feeWaived: a.fee_waived
});

// Mark a deposit: paid (with how/where: "Square terminal", a payment id, "cash"),
// waived, or refunded. The desk uses this when a deposit is taken by hand.
async function markDeposit(code, { status, ref = '' }) {
  if (!['paid', 'waived', 'refunded', 'due'].includes(status)) throw new BookingError(400, 'status must be paid, waived, refunded or due');
  const { rows: [a] } = await query(
    `UPDATE appointments SET deposit_status = $2, deposit_ref = COALESCE(NULLIF($3, ''), deposit_ref), deposit_paid_at = CASE WHEN $2 = 'paid' THEN now() ELSE deposit_paid_at END
      WHERE code = $1 RETURNING id`, [String(code || '').trim().toUpperCase(), status, String(ref || '').slice(0, 120)]);
  if (!a) throw new BookingError(404, 'No appointment with that code');
  const { rows: [row] } = await query(`${APPT_SELECT} WHERE a.code = $1`, [String(code).trim().toUpperCase()]);
  return shape(row);
}
// Loyalty members (and anyone the owner chooses) never forfeit a deposit.
async function waiveFees(phone, waived) {
  const { normalizePhone } = require('./booking');
  const { rowCount } = await query(`UPDATE clients SET fee_waived = $2 WHERE phone = $1`, [normalizePhone(phone), Boolean(waived)]);
  if (!rowCount) throw new BookingError(404, 'No client with that phone');
  return { ok: true, feeWaived: Boolean(waived) };
}

// Move an appointment to a new time (and optionally another stylist who
// offers the service). The client is told; the hub gets the change.
async function move(code, { startAt, stylist = null, reason = '' }) {
  code = String(code || '').trim().toUpperCase();
  const settings = await getSettings();
  const { rows: [a] } = await query(
    `SELECT a.id, a.stylist_id, a.service_id, a.status, a.starts_at, sv.duration_min, s.buffer_min
       FROM appointments a JOIN services s ON s.id = a.service_id LEFT JOIN service_variations sv ON sv.id = a.variation_id
      WHERE a.code = $1`, [code]);
  if (!a) throw new BookingError(404, 'No appointment with that code');
  if (a.status !== 'confirmed') throw new BookingError(409, 'Only a confirmed appointment can be moved');
  const start = new Date(startAt);
  if (isNaN(start)) throw new BookingError(400, 'Invalid start time');
  let stylistId = a.stylist_id;
  if (stylist) {
    const { rows: [st] } = await query(`SELECT st.id FROM stylists st JOIN stylist_services ss ON ss.stylist_id = st.id WHERE st.slug = $1 AND ss.service_id = $2 AND st.active`, [stylist, a.service_id]);
    if (!st) throw new BookingError(404, 'That stylist does not offer this service');
    stylistId = st.id;
  }
  const durationMin = a.duration_min || 60;
  const local = utcToLocal(start, settings.time_zone);
  const ctx = await dayContext([stylistId], local.ymd, settings);
  // The appointment's own old slot must not count as busy.
  const busy = ctx[stylistId].busy.filter(b => !(new Date(b.start).getTime() === new Date(a.starts_at).getTime() && stylistId === a.stylist_id));
  const ok = isBookable(start, { date: local.ymd, tz: settings.time_zone, hours: ctx[stylistId].hours, busy, durationMin, bufferMin: a.buffer_min, leadMin: 0, now: new Date() });
  if (!ok) throw new BookingError(409, 'That time is not open for this stylist');
  const endsAt = new Date(start.getTime() + durationMin * 60000);
  const busyUntil = new Date(endsAt.getTime() + a.buffer_min * 60000);
  try {
    await query(`UPDATE appointments SET stylist_id = $2, starts_at = $3, ends_at = $4, busy_until = $5, moved_from = COALESCE(moved_from, starts_at) WHERE id = $1`,
      [a.id, stylistId, start, endsAt, busyUntil]);
  } catch (e) {
    if (e.code === '23P01') throw new BookingError(409, 'That time was just taken');
    throw e;
  }
  const { rows: [row] } = await query(`${APPT_SELECT} WHERE a.code = $1`, [code]);
  const appt = shape(row);
  const notified = await notify.safely(notify.moved({ ...appt, moveReason: String(reason || '').slice(0, 200) }, settings.time_zone));
  const hub = await teamhub.syncAndRecord(appt);
  return { ...appt, notified, hub };
}

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
  const theme = await require('./themes').forDate(date);
  const policy = require('./policy');
  const now = new Date();
  return {
    date, timeZone: settings.time_zone,
    theme: theme ? { id: theme.id, name: theme.name, audience: theme.audience, headline: theme.headline, body: theme.body } : null,
    policy: { graceMin: Number(settings.late_grace_min) || 0, cancelWindowHours: Number(settings.cancel_window_hours) || 0 },
    appointments: appts.rows.map(r => ({ ...shape(r), late: r.status === 'confirmed' && policy.isLate(r.starts_at, settings, now) })),
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
    if (status === 'no_show') {
      ({ rows: [row] } = await query(`UPDATE appointments SET status = 'no_show', deposit_status = CASE WHEN deposit_status = 'paid' THEN 'forfeited' WHEN deposit_status = 'due' THEN 'none' ELSE deposit_status END WHERE code = $1 RETURNING id`, [code]));
    } else if (status === 'cancelled') {
      const policy = require('./policy');
      const { rows: [cur] } = await query(`SELECT a.starts_at, a.deposit_status, c.fee_waived FROM appointments a JOIN clients c ON c.id = a.client_id WHERE a.code = $1`, [code]);
      const out = cur ? policy.cancelOutcome({ depositStatus: cur.deposit_status, startsAt: cur.starts_at, feeWaived: cur.fee_waived }, settings) : { late: false, deposit: null };
      ({ rows: [row] } = await query(`UPDATE appointments SET status = 'cancelled', cancelled_at = now(), late_cancel = $2, deposit_status = COALESCE($3, deposit_status) WHERE code = $1 RETURNING id`, [code, out.late, out.deposit]));
    } else {
      ({ rows: [row] } = await query(`UPDATE appointments SET status = $2 WHERE code = $1 RETURNING id`, [code, status]));
    }
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
  const hub = await teamhub.syncAndRecord(appt);
  return { ...appt, notified, hub };
}

// ── Team Hub ───────────────────────────────────────────────────────────────
async function hubStatus() {
  const settings = await getSettings();
  return teamhub.status(settings.time_zone);
}

// Re-push every appointment in a date range (all statuses, so the hub also
// learns about cancellations). Used after fixing a mapping or an outage.
async function hubResync({ from, to }) {
  if (!YMD.test(from || '') || !YMD.test(to || '')) throw new BookingError(400, 'from and to must be YYYY-MM-DD');
  if (!teamhub.configured()) throw new BookingError(503, 'Team Hub is not configured');
  const settings = await getSettings();
  const start = localToUtc(from, 0, settings.time_zone);
  const end   = localToUtc(addDays(to, 1), 0, settings.time_zone);
  const { rows } = await query(`${APPT_SELECT} WHERE a.starts_at >= $1 AND a.starts_at < $2 ORDER BY a.starts_at LIMIT 500`, [start, end]);
  const report = { total: rows.length, sent: 0, unmatched: 0, failed: 0, errors: [] };
  for (const r of rows) {
    const res = await teamhub.syncAndRecord(shape(r));
    if (res.sent) { report.sent++; if (res.matched === false) report.unmatched++; }
    else { report.failed++; if (report.errors.length < 5) report.errors.push(`${r.code}: ${res.error || res.skipped}`); }
  }
  return report;
}

// A stylist's weekly hours as the hub currently publishes them (next four
// weeks), for the "Import from Team Hub" button in the stylist editor.
async function hubHours({ email }) {
  email = String(email || '').trim().toLowerCase();
  if (!email) throw new BookingError(400, 'Enter the stylist\'s work email first — that is how Team Hub knows them');
  if (!teamhub.configured()) throw new BookingError(503, 'Team Hub is not configured — set TEAMHUB_URL and TEAMHUB_SECRET');
  const settings = await getSettings();
  const from = todayIn(settings.time_zone), to = addDays(from, 27);
  let data;
  try { data = await teamhub.fetchSchedule(from, to); }
  catch (e) { throw new BookingError(502, 'Could not read the schedule from Team Hub: ' + (e.message || e)); }
  const { hours, sampled } = teamhub.weeklyHours(data, email);
  const known = Boolean(data?.byEmail?.[email]);
  return { email, from, to, known, hours, sampled };
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
    query('SELECT id, slug, name, title, active, sort, email, hours_source FROM stylists ORDER BY sort, name'),
    query('SELECT stylist_id, weekday, start_min, end_min FROM schedules ORDER BY weekday, start_min'),
    query('SELECT ss.stylist_id, s.slug FROM stylist_services ss JOIN services s ON s.id = ss.service_id')
  ]);
  return st.rows.map(s => ({
    slug: s.slug, name: s.name, title: s.title, active: s.active, sort: s.sort,
    email: s.email || '', hoursSource: s.hours_source || 'local',
    hours: hours.rows.filter(h => h.stylist_id === s.id).map(h => ({ weekday: h.weekday, startMin: h.start_min, endMin: h.end_min })),
    services: svc.rows.filter(x => x.stylist_id === s.id).map(x => x.slug)
  }));
}

const slugify = s => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Create or update a stylist, replacing hours and services wholesale.
 * hours: [{weekday 0-6, startMin, endMin}]  services: [slug]
 */
async function saveStylist({ slug, name, title = '', active = true, hours = [], services = [], email = '', hoursSource = 'local' }) {
  name = String(name || '').trim();
  if (name.length < 1) throw new BookingError(400, 'Name is required');
  email = String(email || '').trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BookingError(400, 'That email doesn\'t look right');
  if (!['local', 'hub'].includes(hoursSource)) throw new BookingError(400, 'hoursSource must be local or hub');
  if (hoursSource === 'hub' && !email) throw new BookingError(400, 'Taking hours from Team Hub needs the stylist\'s work email');
  for (const h of hours) {
    if (!(h.weekday >= 0 && h.weekday <= 6 && h.startMin >= 0 && h.endMin <= 1440 && h.endMin > h.startMin)) {
      throw new BookingError(400, 'Hours must be within one day, end after start');
    }
  }
  return withTransaction(async (c) => {
    let id;
    if (slug) {
      const { rows: [r] } = await c.query(
        `UPDATE stylists SET name=$2, title=$3, active=$4, email=$5, hours_source=$6 WHERE slug=$1 RETURNING id`,
        [slug, name, title, active, email || null, hoursSource]);
      if (!r) throw new BookingError(404, 'Unknown stylist');
      id = r.id;
    } else {
      slug = slugify(name) || 'stylist';
      const { rows: [dup] } = await c.query('SELECT 1 FROM stylists WHERE slug = $1', [slug]);
      if (dup) slug += '-' + Date.now().toString(36).slice(-4);
      const { rows: [r] } = await c.query(
        `INSERT INTO stylists (slug, name, title, active, sort, email, hours_source)
         VALUES ($1,$2,$3,$4, (SELECT COALESCE(MAX(sort),0)+1 FROM stylists), $5, $6) RETURNING id`,
        [slug, name, title, active, email || null, hoursSource]);
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
  const doneVisits = new Set();
  for (const r of rows) {
    const appt = shape(r);
    if (appt.visit) {
      // A family visit gets one reminder to the holder, covering everyone.
      if (doneVisits.has(appt.visit.code)) continue;
      doneVisits.add(appt.visit.code);
      const family = require('./family');
      const v = await family.load(appt.visit.code);
      const sent = await notify.safely(notify.familyReminder(v, settings.time_zone));
      await query(`UPDATE appointments SET reminder_sent_at = now() WHERE visit_id = (SELECT id FROM visits WHERE code = $1)`, [v.code]);
      results.push({ code: v.code, sent });
      continue;
    }
    const sent = await notify.safely(notify.reminder(appt, settings.time_zone));
    await query('UPDATE appointments SET reminder_sent_at = now() WHERE id = $1', [r.id]);
    results.push({ code: appt.code, sent });
  }
  return { count: results.length, results };
}

module.exports = { day, setStatus, move, markDeposit, waiveFees, addTimeOff, removeTimeOff, listStylists, saveStylist, sendReminders, hubStatus, hubResync, hubHours, STATUSES };
