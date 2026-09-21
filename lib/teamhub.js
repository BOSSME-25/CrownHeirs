// Team Hub (the private CrownTeam app) integration.
//
// The hub already exposes exactly the two surfaces this needs, built for a
// client site to use, so nothing on the hub side changes:
//   • POST /api/webhooks/highlevel   — appointment events in; the hub matches
//     the stylist from a "calendar id" / "user id" the owner maps once under
//     Admin → HighLevel. We send our stylist slug and work email as those ids.
//   • GET  /api/integrations/schedule — published shifts and approved time off
//     per stylist, keyed by work email. The hub is the source of truth for who
//     works when; a stylist here can opt in to taking hours from it.
// Both are authenticated by the same shared secret (the hub shows it under
// Admin → HighLevel). Configure TEAMHUB_URL and TEAMHUB_SECRET.
//
// Pushes are best-effort: a hub outage can never fail a booking. Each
// appointment records whether the hub accepted it, and /admin can resync.
const { weekdayOf, todayIn } = require('./tz');

let _fetch = (...a) => fetch(...a);           // swapped in tests

function cfg() {
  return { url: (process.env.TEAMHUB_URL || '').replace(/\/$/, ''), secret: process.env.TEAMHUB_SECRET || '' };
}
const configured = () => { const c = cfg(); return Boolean(c.url && c.secret); };

// Our statuses → what the hub's normaliser understands
// ('completed' → showed, 'no_show' → no_show, 'cancelled', else booked).
const HUB_STATUS = { confirmed: 'booked', cancelled: 'cancelled', completed: 'completed', no_show: 'no_show' };

/**
 * The webhook body for one appointment. `a` is the shape lib/staff.js and
 * lib/booking.js produce: { code, status, startsAt, endsAt, service:{name},
 * variation:{name}, stylist:{slug,name,email}, client:{name,phone,email}, notes }.
 */
function payload(a) {
  const what = a.variation?.name && a.variation.name !== 'Regular'
    ? `${a.service.name} (${a.variation.name})` : a.service.name;
  return {
    source: 'crownheirs',
    id: a.code,
    calendarId: a.stylist.slug,
    userId: (a.stylist.email || a.stylist.slug || '').toLowerCase(),
    title: what,
    serviceName: a.service.name,
    variation: a.variation?.name || null,
    contactName: a.client.name,
    contact: { name: a.client.name, phone: a.client.phone || null, email: a.client.email || null },
    startTime: new Date(a.startsAt).toISOString(),
    endTime: new Date(a.endsAt).toISOString(),
    status: HUB_STATUS[a.status] || 'booked',
    stylistName: a.stylist.name,
    notes: a.notes || ''
  };
}

async function pushAppointment(a) {
  if (!configured()) return { skipped: 'Team Hub not configured' };
  const { url, secret } = cfg();
  try {
    const r = await _fetch(url + '/api/webhooks/highlevel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': secret },
      body: JSON.stringify(payload(a))
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: `Team Hub answered ${r.status}${j.error ? ': ' + j.error : ''}` };
    return { sent: true, matched: j.stylistMatched !== false, note: j.note || null };
  } catch (e) {
    return { error: 'Could not reach Team Hub: ' + (e.message || e) };
  }
}

// Push, then remember the outcome on the appointment row so the front desk
// can see which bookings the hub has and resync the ones it doesn't.
async function syncAndRecord(a) {
  const result = await pushAppointment(a);
  if (result.skipped) return result;
  try {
    const { query } = require('./db');
    await query(
      `UPDATE appointments SET hub_synced_at = CASE WHEN $2 THEN now() ELSE hub_synced_at END, hub_error = $3 WHERE code = $1`,
      [a.code, Boolean(result.sent), result.error || (result.matched === false ? 'Hub has no stylist mapping for ' + a.stylist.slug : null)]
    );
  } catch (e) { /* recording is advisory */ }
  return result;
}

// ── Schedule (hours & time off) from the hub ───────────────────────────────
const toMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };

// {entries:[{email,date,start,end,type}]} → { byEmail: { email: { shifts: {date: [{startMin,endMin}]}, off: Set(date) } } }
function normalizeSchedule(j) {
  const byEmail = {};
  for (const e of j?.entries || []) {
    const email = String(e.email || '').trim().toLowerCase();
    if (!email || !e.date) continue;
    const rec = byEmail[email] || (byEmail[email] = { shifts: {}, off: new Set() });
    if (e.type === 'time_off') rec.off.add(e.date);
    else if (e.start && e.end) (rec.shifts[e.date] || (rec.shifts[e.date] = [])).push({ startMin: toMin(e.start), endMin: toMin(e.end) });
  }
  return { byEmail, timezone: j?.timezone || 'America/Phoenix' };
}

let cache = { key: null, at: 0, data: null };
async function fetchSchedule(from, to) {
  if (!configured()) return null;
  const key = from + '|' + to;
  if (cache.key === key && Date.now() - cache.at < 60000) return cache.data;
  const { url, secret } = cfg();
  const r = await _fetch(`${url}/api/integrations/schedule?from=${from}&to=${to}`, { headers: { 'x-webhook-secret': secret } });
  if (!r.ok) throw new Error(`Team Hub schedule answered ${r.status}`);
  const data = normalizeSchedule(await r.json());
  cache = { key, at: Date.now(), data };
  return data;
}

/**
 * Working blocks for one stylist on one date, in the shape the availability
 * engine takes. The hub is authoritative for a stylist who opts in: no
 * published shift, or approved time off, means not bookable that day.
 */
function hubHours(data, email, date) {
  const rec = data?.byEmail?.[String(email || '').trim().toLowerCase()];
  if (!rec || rec.off.has(date)) return [];
  const wd = weekdayOf(date);
  return (rec.shifts[date] || []).filter(b => b.endMin > b.startMin).map(b => ({ weekday: wd, ...b }));
}

async function status(tz = 'America/Phoenix') {
  if (!configured()) return { configured: false, ok: false, detail: 'Not configured — set TEAMHUB_URL and TEAMHUB_SECRET.' };
  const { url, secret } = cfg();
  const today = todayIn(tz);
  try {
    const r = await _fetch(`${url}/api/integrations/schedule?from=${today}&to=${today}`, { headers: { 'x-webhook-secret': secret } });
    if (r.status === 401) return { configured: true, ok: false, detail: 'Team Hub rejected the secret — copy it again from the hub\'s Admin → HighLevel page.' };
    if (!r.ok) return { configured: true, ok: false, detail: `Team Hub answered ${r.status}.` };
    const j = await r.json();
    const n = (j.entries || []).length;
    return { configured: true, ok: true, url, detail: `Connected — the hub published ${n} schedule entr${n === 1 ? 'y' : 'ies'} for today.` };
  } catch (e) {
    return { configured: true, ok: false, detail: 'Could not reach Team Hub: ' + (e.message || e) };
  }
}

module.exports = {
  configured, payload, pushAppointment, syncAndRecord, fetchSchedule, normalizeSchedule, hubHours, status, HUB_STATUS,
  _setFetch: (f) => { _fetch = f; cache = { key: null, at: 0, data: null }; },
  _clearCache: () => { cache = { key: null, at: 0, data: null }; }
};
