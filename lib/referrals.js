// Referrals and Crown Jewels (see the notes on `referrals` and `crown_jewels`
// in schema.sql).
//
// A referral is recorded when it is given: at booking (/book or the desk),
// at checkout (the till), or in the "Referred by" field on the client's Square
// profile. It is connected after the referred client's first paid checkout:
// the referrer is matched to a profile (by phone, then email, then a unique
// full name, here and then in Square's customer directory), the referral is
// linked to that profile, and the referrer earns Crown Jewels (the
// referral_jewels setting). Anything that can't be matched with confidence
// waits for the desk under Referrals, "Needs a match". A person is referred
// once; a voided or fully refunded checkout takes the jewels back.
//
// Crown Jewels are a ledger (earned, reversed, redeemed for merch), kept here.
// When the referrer has a Square profile, their balance and referral count are
// written to it, so they show in Square too.
const crypto = require('crypto');
const { query, withTransaction, getSettings } = require('./db');
const square = require('./square');
const B = () => require('./booking');                 // loaded lazily: booking.js requires this file

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRING_SCHEMA = 'https://developer-production-s.squarecdn.com/schemas/v1/common.json#squareup.common.String';
const CLIENT = 'SELECT id, name, phone, email, square_customer_id FROM clients';
const squish = s => String(s || '').trim().replace(/\s+/g, ' ');
const nameKey = s => squish(s).toLowerCase();
const fail = (status, msg) => new (B().BookingError)(status, msg);
const putSetting = (k, v) => query(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [k, String(v)]);
function phoneOf(raw) { try { return raw ? B().normalizePhone(raw) : null; } catch { return null; } }
function json(v, fallback) { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
const fullName = cu => squish([cu.given_name, cu.family_name].filter(Boolean).join(' ')) || squish(cu.company_name) || squish(cu.nickname) || 'Square customer';

// ── What was given ───────────────────────────────────────────────────────────

// Square's "Referred by" is one line: a phone and an email are pulled out of
// it and the rest is the name.
function parseText(text) {
  let t = String(text || '');
  const email = (t.match(/[^\s@,;()]+@[^\s@,;()]+\.[^\s@,;()]+/) || [''])[0];
  if (email) t = t.replace(email, ' ');
  const phone = (t.match(/\+?1?[\s.(-]*\d{3}[\s.)-]*\d{3}[\s.-]*\d{4}/) || [''])[0];
  if (phone) t = t.replace(phone, ' ');
  return { name: squish(t.replace(/[,;|/()·•]+/g, ' ').replace(/\s-\s/g, ' ')), phone: phone.trim(), email };
}

// Who referred them, as typed. Null when nothing was given. `strict` (a person
// typing into a form) reports a bad phone or email; Square's free text keeps
// whatever can be read.
function cleanGiven(g, { strict = true } = {}) {
  if (!g) return null;
  if (typeof g === 'string') g = parseText(g);
  const name = squish(g.name).slice(0, 80);
  const rawPhone = String(g.phone || '').trim();
  const rawEmail = String(g.email || '').trim().toLowerCase().slice(0, 120);
  const phone = phoneOf(rawPhone);
  if (rawPhone && !phone && strict) throw fail(400, "The referrer's phone should be a 10-digit number");
  if (rawEmail && !EMAIL.test(rawEmail) && strict) throw fail(400, "The referrer's email doesn't look right");
  const out = { name, phone, email: EMAIL.test(rawEmail) ? rawEmail : null };
  return out.name || out.phone || out.email ? out : null;
}

// ── Recording ────────────────────────────────────────────────────────────────

// Record (or update) the referral a client gave. `db` is a transaction's
// client when called from inside a booking. A connected referral is never
// replaced, and a client can't name themselves.
async function recordPending(db, { referredClientId, given = null, referrerClientId = null, source, appointmentId = null, visitId = null, squarePaymentId = null }) {
  const run = (sql, p) => (db ? db.query(sql, p) : query(sql, p));
  if (!referredClientId || (!given && !referrerClientId) || referrerClientId === referredClientId) return null;
  const { rows: [me] } = await run(`${CLIENT} WHERE id = $1`, [referredClientId]);
  if (!me) return null;
  if (given && ((given.phone && given.phone === me.phone) || (given.email && me.email && given.email === me.email.toLowerCase()))) return null;
  const { rows: [live] } = await run(`SELECT * FROM referrals WHERE referred_client_id = $1 AND status <> 'void'`, [referredClientId]);
  if (live && live.status === 'connected') return live;
  const g = given || { name: '', phone: null, email: null };
  if (live) {
    const { rows: [r] } = await run(
      `UPDATE referrals SET given_name = $2, given_phone = $3, given_email = $4, referrer_client_id = $5, source = $6,
         appointment_id = COALESCE($7, appointment_id), visit_id = COALESCE($8, visit_id), square_payment_id = COALESCE($9, square_payment_id),
         status = 'pending', updated_at = now() WHERE id = $1 RETURNING *`,
      [live.id, g.name, g.phone, g.email, referrerClientId, source, appointmentId, visitId, squarePaymentId]);
    return r;
  }
  const { rows: [r] } = await run(
    `INSERT INTO referrals (referred_client_id, given_name, given_phone, given_email, referrer_client_id, source, appointment_id, visit_id, square_payment_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [referredClientId, g.name, g.phone, g.email, referrerClientId, source, appointmentId, visitId, squarePaymentId]);
  return r;
}

// ── Matching ─────────────────────────────────────────────────────────────────

// The referrer among clients here: by phone, then email, then a unique full
// name (unless a phone or email was given that belongs to someone else).
// { client, by } when sure; { candidates } when it could be several.
async function match(given, { exclude = null } = {}) {
  if (!given) return {};
  const others = rows => rows.filter(r => r.id !== exclude);
  if (given.phone) {
    const r = others((await query(`${CLIENT} WHERE phone = $1`, [given.phone])).rows);
    if (r.length === 1) return { client: r[0], by: 'phone' };
  }
  if (given.email) {
    const r = others((await query(`${CLIENT} WHERE lower(email) = $1 ORDER BY id`, [given.email])).rows);
    if (r.length === 1) return { client: r[0], by: 'email' };
    if (r.length > 1) return { candidates: r };
  }
  if (given.name) {
    const r = others((await query(`${CLIENT} WHERE lower(regexp_replace(btrim(name), '\\s+', ' ', 'g')) = $1 ORDER BY id`, [nameKey(given.name)])).rows);
    const clash = c => (given.phone && c.phone && c.phone !== given.phone) || (given.email && c.email && c.email.toLowerCase() !== given.email);
    if (r.length === 1 && !clash(r[0])) return { client: r[0], by: 'name' };
    if (r.length) return { candidates: r };
  }
  return {};
}

// The same, in Square's customer directory, for referrers who have only ever
// been in Square. A match becomes a client here, linked to their Square profile.
let squareCache = { at: 0, list: null };
async function allSquareCustomers() {
  if (squareCache.list && Date.now() - squareCache.at < 10 * 60000) return squareCache.list;
  const list = []; let cursor = null, pages = 0;
  do {
    const j = await square.api('/v2/customers?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    list.push(...(j.customers || [])); cursor = j.cursor; pages++;
  } while (cursor && pages < 60);
  squareCache = { at: Date.now(), list };
  return list;
}
async function squareSearch(filter) {
  const j = await square.api('/v2/customers/search', { method: 'POST', body: { query: { filter }, limit: 10 } });
  return j.customers || [];
}
async function matchInSquare(given) {
  if (!square.configured() || !given) return {};
  if (given.phone) { const c = await squareSearch({ phone_number: { exact: '+' + given.phone } }); if (c.length === 1) return { customer: c[0], by: 'phone' }; }
  if (given.email) { const c = await squareSearch({ email_address: { exact: given.email } }); if (c.length === 1) return { customer: c[0], by: 'email' }; if (c.length > 1) return { several: true }; }
  if (given.name) {
    const c = (await allSquareCustomers()).filter(x => nameKey(fullName(x)) === nameKey(given.name));
    if (c.length === 1) return { customer: c[0], by: 'name' };
    if (c.length > 1) return { several: true };
  }
  return {};
}

// The client here for a Square customer: theirs already, or the client with
// their phone (now linked to it), or a new one.
async function upsertSquareClient(cu) {
  const name = fullName(cu), phone = phoneOf(cu.phone_number);
  const email = String(cu.email_address || '').trim().toLowerCase() || null;
  return withTransaction(async (c) => {
    let { rows: [row] } = await c.query(`${CLIENT} WHERE square_customer_id = $1`, [cu.id]);
    if (row) return row;
    let phoneTaken = false;
    if (phone) {
      ({ rows: [row] } = await c.query(`${CLIENT} WHERE phone = $1 FOR UPDATE`, [phone]));
      if (row && !row.square_customer_id) {
        ({ rows: [row] } = await c.query(`UPDATE clients SET square_customer_id = $2, email = COALESCE(email, $3) WHERE id = $1 RETURNING id, name, phone, email, square_customer_id`, [row.id, cu.id, email]));
        return row;
      }
      phoneTaken = Boolean(row);                // that phone is another Square profile's
    }
    ({ rows: [row] } = await c.query(`INSERT INTO clients (name, phone, email, square_customer_id) VALUES ($1,$2,$3,$4) RETURNING id, name, phone, email, square_customer_id`,
      [name, phoneTaken ? null : phone, email, cu.id]));
    return row;
  });
}

// A referrer the desk picked: a client here, or a Square customer (made a client).
async function resolveReferrer({ referrerClientId = null, referrerSquareId = null } = {}) {
  if (referrerClientId) {
    const { rows: [c] } = await query(`${CLIENT} WHERE id = $1`, [Number(referrerClientId)]);
    if (!c) throw fail(404, 'No client with that id');
    return c.id;
  }
  if (referrerSquareId) {
    if (!square.configured()) throw fail(400, 'Square is not connected');
    const { customer } = await square.api(`/v2/customers/${encodeURIComponent(referrerSquareId)}`);
    return (await upsertSquareClient(customer)).id;
  }
  return null;
}

// ── Connecting after checkout ────────────────────────────────────────────────

// Called once the referred client has a paid checkout (a ticket here or a
// Square payment). Connects their referral to the referrer's profile and
// awards Crown Jewels, or marks it "needs a match" for the desk.
async function connect(referredClientId, { ticketId = null, squarePaymentId = null, by = null } = {}) {
  const { rows: [r] } = await query(`SELECT * FROM referrals WHERE referred_client_id = $1 AND status IN ('pending', 'needs_match')`, [referredClientId]);
  if (!r) return null;
  let referrerId = r.referrer_client_id;
  if (!referrerId) {
    const given = { name: r.given_name, phone: r.given_phone, email: r.given_email };
    const m = await match(given, { exclude: referredClientId });
    if (m.client) referrerId = m.client.id;
    else if (!m.candidates) {
      const s = await matchInSquare(given).catch(() => ({}));
      if (s.customer) { const cl = await upsertSquareClient(s.customer); if (cl.id !== referredClientId) referrerId = cl.id; }
    }
  }
  if (!referrerId) {
    const { rows: [u] } = await query(
      `UPDATE referrals SET status = 'needs_match', ticket_id = COALESCE($2, ticket_id), square_payment_id = COALESCE($3, square_payment_id), updated_at = now() WHERE id = $1 RETURNING *`,
      [r.id, ticketId, squarePaymentId]);
    return u;
  }
  const jewels = Math.max(0, Number((await getSettings()).referral_jewels) || 0);
  const done = await withTransaction(async (c) => {
    const { rows: [u] } = await c.query(
      `UPDATE referrals SET status = 'connected', referrer_client_id = $2, ticket_id = COALESCE($3, ticket_id), square_payment_id = COALESCE($4, square_payment_id),
         jewels = $5, connected_at = now(), updated_at = now() WHERE id = $1 AND status IN ('pending', 'needs_match') RETURNING *`,
      [r.id, referrerId, ticketId, squarePaymentId, jewels]);
    if (!u) return null;                                          // connected meanwhile
    if (jewels) await c.query(`INSERT INTO crown_jewels (client_id, delta, reason, referral_id, created_by) VALUES ($1, $2, 'referral', $3, $4)`, [referrerId, jewels, u.id, by]);
    return u;
  });
  if (done) done.square = await pushToSquare(referrerId);
  return done;
}

async function onTicketPaid(code) {
  const { rows: [t] } = await query(`SELECT id, client_id FROM tickets WHERE code = $1`, [String(code || '').toUpperCase()]);
  return t && t.client_id ? connect(t.client_id, { ticketId: t.id, by: 'till' }) : null;
}

// A voided or fully refunded checkout takes the jewels back; the referral
// waits for the next paid checkout, still pointing at the same referrer.
async function onTicketReversed(code) {
  const r = await withTransaction(async (c) => {
    const { rows: [row] } = await c.query(
      `SELECT r.* FROM referrals r JOIN tickets t ON t.id = r.ticket_id WHERE t.code = $1 AND r.status = 'connected' FOR UPDATE OF r`, [String(code || '').toUpperCase()]);
    if (!row) return null;
    await c.query(`UPDATE referrals SET status = 'pending', ticket_id = NULL, connected_at = NULL, jewels = 0, updated_at = now() WHERE id = $1`, [row.id]);
    if (row.jewels) await c.query(`INSERT INTO crown_jewels (client_id, delta, reason, referral_id, note, created_by) VALUES ($1, $2, 'reversed', $3, 'The checkout was voided or refunded', 'till')`, [row.referrer_client_id, -row.jewels, row.id]);
    return row;
  });
  if (r) r.square = await pushToSquare(r.referrer_client_id);
  return r;
}

// ── The desk ─────────────────────────────────────────────────────────────────

// At checkout: add or change who referred this ticket's client. If the ticket
// is already paid, it connects straight away.
async function setForTicket(code, { referrerClientId = null, referrerSquareId = null, given = null } = {}) {
  const { rows: [t] } = await query(`SELECT id, client_id, status FROM tickets WHERE code = $1`, [String(code || '').toUpperCase()]);
  if (!t) throw fail(404, 'No ticket with that code');
  if (!t.client_id) throw fail(400, 'This ticket has no client profile. A walk-in needs a phone number to be credited with a referral.');
  const live = await liveFor(t.client_id);
  if (live && live.status === 'connected') throw fail(409, 'This client\'s referral is already connected.');
  const referrerId = await resolveReferrer({ referrerClientId, referrerSquareId });
  const g = cleanGiven(given);
  if (!referrerId && !g) throw fail(400, 'Pick the client who referred them, or type their name, phone or email.');
  if (referrerId === t.client_id) throw fail(400, 'A client can\'t refer themselves.');
  const rec = await recordPending(null, { referredClientId: t.client_id, given: g, referrerClientId: referrerId, source: 'checkout' });
  if (!rec) throw fail(400, 'That phone or email is this client\'s own.');
  if (t.status === 'paid') return connect(t.client_id, { ticketId: t.id, by: 'till' });
  return rec;
}

// Referrals → Needs a match: pick the referrer. If the checkout has happened, it connects now.
async function pick(referralId, { referrerClientId = null, referrerSquareId = null } = {}, by = null) {
  const { rows: [r] } = await query(`SELECT * FROM referrals WHERE id = $1`, [Number(referralId)]);
  if (!r || r.status === 'void') throw fail(404, 'No referral with that id');
  if (r.status === 'connected') throw fail(409, 'That referral is already connected.');
  const referrerId = await resolveReferrer({ referrerClientId, referrerSquareId });
  if (!referrerId) throw fail(400, 'Pick the client who referred them.');
  if (referrerId === r.referred_client_id) throw fail(400, 'A client can\'t refer themselves.');
  await query(`UPDATE referrals SET referrer_client_id = $2, updated_at = now() WHERE id = $1`, [r.id, referrerId]);
  if (r.status === 'needs_match') return connect(r.referred_client_id, { by });
  return (await query(`SELECT * FROM referrals WHERE id = $1`, [r.id])).rows[0];
}

// Take back a referral that hasn't been connected (given by mistake).
async function clear(referredClientId) {
  const { rows: [r] } = await query(
    `UPDATE referrals SET status = 'void', updated_at = now() WHERE referred_client_id = $1 AND status IN ('pending', 'needs_match') RETURNING id`, [Number(referredClientId)]);
  if (!r) throw fail(404, 'No open referral for that client');
  return { cleared: true };
}

// Spend Crown Jewels on merch. Never below zero.
async function redeem(clientId, { jewels, note = '', by = null }) {
  const n = Number(jewels);
  if (!Number.isInteger(n) || n <= 0) throw fail(400, 'Redeem a whole number of Crown Jewels');
  const what = squish(note).slice(0, 120);
  if (!what) throw fail(400, 'Say what they redeemed it for (the merch item)');
  await withTransaction(async (c) => {
    const { rows: [cl] } = await c.query(`SELECT id FROM clients WHERE id = $1 FOR UPDATE`, [Number(clientId)]);
    if (!cl) throw fail(404, 'No client with that id');
    const { rows: [b] } = await c.query(`SELECT COALESCE(SUM(delta), 0)::int AS balance FROM crown_jewels WHERE client_id = $1`, [cl.id]);
    if (b.balance < n) throw fail(400, `They have ${b.balance} Crown Jewel${b.balance === 1 ? '' : 's'}`);
    await c.query(`INSERT INTO crown_jewels (client_id, delta, reason, note, created_by) VALUES ($1, $2, 'redeemed', $3, $4)`, [cl.id, -n, what, by]);
  });
  const p = await profile(clientId);
  p.square = await pushToSquare(Number(clientId));
  return p;
}

const liveFor = async (clientId) => (await query(`SELECT * FROM referrals WHERE referred_client_id = $1 AND status <> 'void'`, [clientId])).rows[0] || null;
const shapeClient = c => c && ({ id: c.id, name: c.name, phone: c.phone, email: c.email, squareCustomerId: c.square_customer_id || null });

// A client's referral picture: who referred them, whom they referred, Crown Jewels.
async function profile(clientId) {
  const { rows: [c] } = await query(`${CLIENT} WHERE id = $1`, [Number(clientId)]);
  if (!c) throw fail(404, 'No client with that id');
  const { rows: [by] } = await query(
    `SELECT r.*, c.name AS referrer_name, c.phone AS referrer_phone FROM referrals r LEFT JOIN clients c ON c.id = r.referrer_client_id
     WHERE r.referred_client_id = $1 AND r.status <> 'void'`, [c.id]);
  const { rows: referred } = await query(
    `SELECT r.id, r.status, r.jewels, r.connected_at, r.created_at, c.id AS client_id, c.name, c.phone FROM referrals r JOIN clients c ON c.id = r.referred_client_id
     WHERE r.referrer_client_id = $1 AND r.status <> 'void' ORDER BY r.created_at DESC`, [c.id]);
  const { rows: history } = await query(`SELECT delta, reason, note, created_by, created_at FROM crown_jewels WHERE client_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50`, [c.id]);
  const { rows: [bal] } = await query(`SELECT COALESCE(SUM(delta), 0)::int AS balance FROM crown_jewels WHERE client_id = $1`, [c.id]);
  return {
    client: shapeClient(c),
    referredBy: by ? { id: by.id, status: by.status, source: by.source, given: { name: by.given_name, phone: by.given_phone, email: by.given_email },
      referrer: by.referrer_client_id ? { id: by.referrer_client_id, name: by.referrer_name, phone: by.referrer_phone } : null, connectedAt: by.connected_at } : null,
    referred: referred.map(r => ({ id: r.id, status: r.status, jewels: r.jewels, connectedAt: r.connected_at, createdAt: r.created_at, client: { id: r.client_id, name: r.name, phone: r.phone } })),
    jewels: { balance: bal.balance, history }
  };
}

// Clients by name, phone or email; Square's directory too, so the desk can pick anyone.
async function searchClients(q, { limit = 12 } = {}) {
  const text = squish(q);
  if (text.length < 2) return [];
  const digits = text.replace(/\D/g, '');
  const { rows } = await query(
    `${CLIENT} WHERE lower(name) LIKE $1 OR lower(coalesce(email, '')) LIKE $1 OR ($2 <> '' AND phone LIKE '%' || $2 || '%')
     ORDER BY lower(name), id LIMIT $3`, ['%' + text.toLowerCase().replace(/[%_]/g, '') + '%', digits.length >= 3 ? digits : '', limit]);
  const out = rows.map(r => ({ ...shapeClient(r), from: 'site' }));
  if (square.configured() && out.length < limit) {
    try {
      let found;
      if (digits.length >= 10) found = await squareSearch({ phone_number: { exact: '+' + phoneOf(digits) } });
      else if (EMAIL.test(text)) found = await squareSearch({ email_address: { exact: text.toLowerCase() } });
      else found = (await allSquareCustomers()).filter(x => nameKey(fullName(x)).includes(text.toLowerCase())).slice(0, limit);
      for (const cu of found) if (!out.some(r => r.squareCustomerId === cu.id)) out.push({ id: null, name: fullName(cu), phone: phoneOf(cu.phone_number), email: cu.email_address || null, squareCustomerId: cu.id, from: 'square' });
    } catch (e) { /* Square is a bonus here; the site's own clients still come back */ }
  }
  return out.slice(0, limit);
}

// Referrals for the desk: needs a match first, then waiting for checkout, then connected.
async function list({ status = null, limit = 100 } = {}) {
  const { rows } = await query(
    `SELECT r.*, a.name AS referred_name, a.phone AS referred_phone, b.name AS referrer_name, b.phone AS referrer_phone
     FROM referrals r JOIN clients a ON a.id = r.referred_client_id LEFT JOIN clients b ON b.id = r.referrer_client_id
     WHERE r.status <> 'void' AND ($1::text IS NULL OR r.status = $1)
     ORDER BY CASE r.status WHEN 'needs_match' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, r.updated_at DESC LIMIT $2`, [status, limit]);
  return rows.map(r => ({
    id: r.id, status: r.status, source: r.source, jewels: r.jewels, createdAt: r.created_at, connectedAt: r.connected_at, note: r.note,
    referred: { id: r.referred_client_id, name: r.referred_name, phone: r.referred_phone },
    given: { name: r.given_name, phone: r.given_phone, email: r.given_email },
    referrer: r.referrer_client_id ? { id: r.referrer_client_id, name: r.referrer_name, phone: r.referrer_phone } : null
  }));
}

// ── Square ───────────────────────────────────────────────────────────────────

const FIELDS = [
  { role: 'referredBy', key: 'crown-heirs-referred-by', name: 'Referred by', visibility: 'VISIBILITY_READ_WRITE_VALUES',
    description: "Who referred this client: their name, phone and/or email. Crown Heirs connects it to that client's profile after checkout." },
  { role: 'jewels', key: 'crown-heirs-crown-jewels', name: 'Crown Jewels', visibility: 'VISIBILITY_READ_ONLY',
    description: 'Referral reward balance, kept by the Crown Heirs site. Redeemed for merch at the desk.' },
  { role: 'referrals', key: 'crown-heirs-referrals', name: 'Referrals', visibility: 'VISIBILITY_READ_ONLY',
    description: 'How many clients this client has referred, counted once each is connected after checkout.' }
];
const needSquare = () => { if (!square.configured()) throw fail(400, 'Square isn\'t connected to the site yet: SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID need to be set on Vercel.'); };

async function definitions() {
  const out = []; let cursor = null, pages = 0;
  do {
    const j = await square.api('/v2/customers/custom-attribute-definitions?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));
    out.push(...(j.custom_attribute_definitions || [])); cursor = j.cursor; pages++;
  } while (cursor && pages < 10);
  return out;
}

// Make (or find) the three fields on Square customer profiles. A field of the
// same name made in the Square Dashboard is used rather than a second one, so
// the booking form and checkout share it.
async function setupSquare() {
  needSquare();
  const have = await definitions(), keys = {}, made = [], found = [];
  for (const f of FIELDS) {
    const d = have.find(x => x.key === f.key) || have.find(x => nameKey(x.name) === nameKey(f.name));
    if (d) { keys[f.role] = d.key; found.push(f.name); continue; }
    const j = await square.api('/v2/customers/custom-attribute-definitions', { method: 'POST', body: {
      custom_attribute_definition: { key: f.key, name: f.name, description: f.description, visibility: f.visibility, schema: { $ref: STRING_SCHEMA } },
      idempotency_key: crypto.randomUUID() } });
    keys[f.role] = j.custom_attribute_definition.key; made.push(f.name);
  }
  await putSetting('referrals_square_keys', JSON.stringify(keys));
  const s = await getSettings();
  if (!s.referrals_square_since) await putSetting('referrals_square_since', new Date().toISOString());   // only checkouts from now on count
  return { keys, made, found };
}

async function readAttr(customerId, key) {
  try {
    const j = await square.api(`/v2/customers/${encodeURIComponent(customerId)}/custom-attributes/${encodeURIComponent(key)}`);
    const v = j.custom_attribute && j.custom_attribute.value;
    return v == null ? '' : String(v).trim();
  } catch (e) { if (/Square 404/.test(e.message)) return ''; throw e; }
}
async function writeAttr(customerId, key, value) {
  await square.api(`/v2/customers/${encodeURIComponent(customerId)}/custom-attributes/${encodeURIComponent(key)}`,
    { method: 'POST', body: { custom_attribute: { value: String(value) }, idempotency_key: crypto.randomUUID() } });
}

// Show a client's Crown Jewels and referral count on their Square profile. Best-effort.
async function pushToSquare(clientId) {
  if (!square.configured()) return null;
  try {
    const keys = json((await getSettings()).referrals_square_keys, {});
    if (!keys.jewels && !keys.referrals) return null;
    const { rows: [c] } = await query(`SELECT square_customer_id FROM clients WHERE id = $1`, [clientId]);
    if (!c || !c.square_customer_id) return null;
    const { rows: [n] } = await query(
      `SELECT (SELECT COALESCE(SUM(delta), 0)::int FROM crown_jewels WHERE client_id = $1) AS jewels,
              (SELECT count(*)::int FROM referrals WHERE referrer_client_id = $1 AND status = 'connected') AS referrals`, [clientId]);
    if (keys.jewels) await writeAttr(c.square_customer_id, keys.jewels, n.jewels);
    if (keys.referrals) await writeAttr(c.square_customer_id, keys.referrals, n.referrals);
    return { ok: true };
  } catch (e) { return { error: String(e.message || e) }; }
}

// After Square checkouts: each customer with a completed payment since the
// last run whose "Referred by" is filled in gets their referral recorded and
// connected (or marked "needs a match"). Runs daily, and from Settings.
async function syncSquare({ now = new Date() } = {}) {
  needSquare();
  const s = await getSettings();
  const keys = json(s.referrals_square_keys, {});
  if (!keys.referredBy) throw fail(400, 'Press "Set up in Square" first, so Square has a Referred by field.');
  const since = s.referrals_square_since ? new Date(s.referrals_square_since) : new Date(now.getTime() - 86400000);
  const payments = []; let cursor = null, pages = 0;
  do {
    const qs = new URLSearchParams({ begin_time: since.toISOString(), end_time: now.toISOString(), location_id: process.env.SQUARE_LOCATION_ID, sort_order: 'ASC', limit: '100' });
    if (cursor) qs.set('cursor', cursor);
    const j = await square.api('/v2/payments?' + qs);
    payments.push(...(j.payments || [])); cursor = j.cursor; pages++;
  } while (cursor && pages < 50);
  const firstPayment = new Map();
  for (const p of payments) if (p.status === 'COMPLETED' && p.customer_id && !firstPayment.has(p.customer_id)) firstPayment.set(p.customer_id, p.id);
  const out = { payments: payments.length, customers: firstPayment.size, connected: 0, needsMatch: 0, alreadyConnected: 0, noReferral: 0, errors: [] };
  for (const [customerId, paymentId] of firstPayment) {
    try {
      const value = await readAttr(customerId, keys.referredBy);
      if (!value) { out.noReferral++; continue; }
      const { customer } = await square.api(`/v2/customers/${encodeURIComponent(customerId)}`);
      const me = await upsertSquareClient(customer);
      const live = await liveFor(me.id);
      if (live && live.status === 'connected') { out.alreadyConnected++; continue; }
      // A referrer the desk already picked stands; Square's text fills in otherwise.
      if (!live || !live.referrer_client_id) await recordPending(null, { referredClientId: me.id, given: cleanGiven(value, { strict: false }), source: 'square', squarePaymentId: paymentId });
      const r = await connect(me.id, { squarePaymentId: paymentId, by: 'square' });
      if (r && r.status === 'connected') out.connected++;
      else if (r && r.status === 'needs_match') out.needsMatch++;
    } catch (e) { out.errors.push(`${customerId}: ${e.message}`); }
  }
  await putSetting('referrals_square_since', now.toISOString());
  await putSetting('referrals_square_last', JSON.stringify({ at: now.toISOString(), ...out, errors: out.errors.length }));
  return out;
}

async function status() {
  const s = await getSettings();
  const { rows: [n] } = await query(
    `SELECT count(*) FILTER (WHERE status = 'needs_match')::int AS needs_match, count(*) FILTER (WHERE status = 'pending')::int AS pending,
            count(*) FILTER (WHERE status = 'connected')::int AS connected,
            (SELECT COALESCE(SUM(delta), 0)::int FROM crown_jewels) AS jewels_outstanding FROM referrals WHERE status <> 'void'`);
  return {
    jewelsPerReferral: Number(s.referral_jewels) || 0, counts: n,
    square: { connected: square.configured(), fields: json(s.referrals_square_keys, {}), since: s.referrals_square_since || null, last: json(s.referrals_square_last, null) }
  };
}

module.exports = {
  cleanGiven, parseText, recordPending, match, connect, onTicketPaid, onTicketReversed,
  setForTicket, pick, clear, redeem, profile, searchClients, list, status,
  setupSquare, syncSquare, pushToSquare, upsertSquareClient,
  _resetSquareCache: () => { squareCache = { at: 0, list: null }; }
};
