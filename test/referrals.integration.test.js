// Referrals and Crown Jewels against Postgres, with Square stubbed: a referral
// given at booking (online and at the desk) or at checkout, connected to the
// referrer's profile after the first paid checkout (matched by phone, email or
// a unique name), "needs a match" when unsure, jewels taken back on a void,
// redeemed for merch, and the Square side (fields on customer profiles, the
// daily read of "Referred by" after Square checkouts, balances written back).
const test = require('node:test');
const assert = require('node:assert/strict');

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  test('referrals integration (skipped: no TEST_DATABASE_URL)', { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = url;
  process.env.BOOKING_MODE = 'site';
  process.env.NOTIFY_DRY_RUN = '1';
  process.env.ADMIN_PASSWORD = 'test-admin-key';
  delete process.env.SQUARE_ACCESS_TOKEN; delete process.env.SQUARE_LOCATION_ID;
  const db = require('../lib/db');
  const { migrate, seed } = require('../lib/setup');
  const B = require('../lib/booking');
  const T = require('../lib/tickets');
  const R = require('../lib/referrals');
  const square = require('../lib/square');
  const staffApi = require('../api/book/staff');
  const createApi = require('../api/book/create');
  const cronApi = require('../api/book/referrals');
  const { addDays, todayIn, weekdayOf } = require('../lib/tz');

  const req = (method, { query = {}, body, headers = {} } = {}) => ({ method, query, body, headers });
  const res = () => ({ statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; } });
  const call = async (h, r) => { const s = res(); await h(r, s); return s; };
  const ADMIN = { 'x-admin-key': 'test-admin-key' };
  const desk = async (method, x) => call(staffApi, req(method, method === 'GET' ? { headers: ADMIN, query: x } : { headers: ADMIN, body: x }));

  // This suite owns phones …0700–0749 and the referral settings.
  const P = n => '16025550' + String(700 + n);                  // stored form
  const typed = n => `(602) 555-0${700 + n}`;                       // as a person types it
  const MINE = `SELECT id FROM clients WHERE phone LIKE '1602555070_' OR phone LIKE '1602555071_' OR phone LIKE '1602555072_' OR phone LIKE '1602555073_' OR phone LIKE '1602555074_' OR name LIKE 'Zq %' OR square_customer_id LIKE 'SQ-ZQ-%'`;
  const SETTINGS = ['referral_jewels', 'referrals_square_keys', 'referrals_square_since', 'referrals_square_last'];

  async function cleanup() {
    const appts = `SELECT id FROM appointments WHERE client_id IN (${MINE})`;
    await db.query(`DELETE FROM ticket_refunds WHERE ticket_id IN (SELECT id FROM tickets WHERE client_id IN (${MINE}) OR appointment_id IN (${appts}))`);
    await db.query(`DELETE FROM tickets WHERE client_id IN (${MINE}) OR appointment_id IN (${appts})`);
    await db.query(`DELETE FROM appointments WHERE id IN (${appts})`);
    await db.query(`DELETE FROM clients WHERE id IN (${MINE})`);
    await db.query(`DELETE FROM settings WHERE key = ANY($1)`, [SETTINGS]);
    await db.query(`INSERT INTO settings (key, value) VALUES ('referral_jewels', '1')`);
  }
  const client = async (name, n, email = null) => (await db.query(`INSERT INTO clients (name, phone, email) VALUES ($1, $2, $3) RETURNING *`, [name, n == null ? null : P(n), email])).rows[0];
  const referralOf = async (clientId) => (await db.query(`SELECT * FROM referrals WHERE referred_client_id = $1 AND status <> 'void'`, [clientId])).rows[0];
  const balance = async (clientId) => (await R.profile(clientId)).jewels.balance;
  // A walk-in ticket with a priced line, for a client with phone n.
  async function ticketFor(name, n, cents = 6000) {
    const t = await T.open({ client: { name, phone: typed(n) } });
    await T.addLine(t.code, { kind: 'retail', name: 'Crown Oil', provider: 'bethany', gross_cents: cents });
    return T.get(t.code);
  }

  let RETWIST_V, DATE;
  test.before(async () => {
    await migrate(); await seed();
    await cleanup();
    RETWIST_V = (await B.listServices()).flatMap(c => c.services).find(s => s.slug === 'loc-retwist').variations[0];
    DATE = addDays(todayIn('America/Phoenix'), 17);                 // a Thursday about 2½ weeks out, away from other suites' days
    while (weekdayOf(DATE) !== 4) DATE = addDays(DATE, 1);
  });
  test.after(async () => {
    square._setFetch((...a) => fetch(...a));
    delete process.env.SQUARE_ACCESS_TOKEN; delete process.env.SQUARE_LOCATION_ID;
    await cleanup();
    await db.getPool().end();
  });

  test('what was given: Square\'s one line is split into name, phone and email; a form is checked', () => {
    assert.deepEqual(R.parseText('Zq Jane Doe, 602-555-0101  jane@example.com'), { name: 'Zq Jane Doe', phone: '602-555-0101', email: 'jane@example.com' });
    assert.deepEqual(R.cleanGiven('Zq Jane Doe (602) 555-0101'), { name: 'Zq Jane Doe', phone: '16025550101', email: null });
    assert.equal(R.cleanGiven({ name: ' ', phone: '', email: '' }), null);
    assert.equal(R.cleanGiven(null), null);
    assert.throws(() => R.cleanGiven({ name: 'X', phone: '123' }), (e) => e.status === 400 && /10-digit/.test(e.message));
    assert.throws(() => R.cleanGiven({ name: 'X', email: 'not-an-email' }), (e) => e.status === 400 && /email/.test(e.message));
    assert.deepEqual(R.cleanGiven({ name: 'X', phone: '123', email: 'nope' }, { strict: false }), { name: 'X', phone: null, email: null });
  });

  test('booked online with a referrer: recorded, then connected to the referrer\'s profile after the paid checkout', async () => {
    const referrer = await client('Zq Rhonda Referrer', 1, 'rhonda@example.com');
    const { any } = await B.availability({ serviceSlug: 'loc-retwist', variationId: RETWIST_V.id, date: DATE, stylistSlug: 'bethany' });
    assert.ok(any.length > 4, 'the day has openings');
    const r = await call(createApi, req('POST', { body: {
      service: 'loc-retwist', variation: RETWIST_V.id, stylist: 'bethany', startAt: any[any.length - 2], policyAck: true,
      client: { name: 'Zq Nia New', phone: typed(2) }, referrer: { name: 'Rhonda', phone: typed(1), email: '' } } }));
    assert.equal(r.statusCode, 201, JSON.stringify(r.body));
    const nia = (await db.query(`SELECT * FROM clients WHERE phone = $1`, [P(2)])).rows[0];
    let ref = await referralOf(nia.id);
    assert.equal(ref.status, 'pending'); assert.equal(ref.source, 'online'); assert.equal(ref.given_phone, P(1));
    assert.equal(ref.referrer_client_id, null, 'matched only after checkout');
    assert.ok(ref.appointment_id);

    // Not yet: nothing has been paid.
    assert.equal(await balance(referrer.id), 0);

    const t = await T.open({ appointmentCode: r.body.code });
    const lines = (await T.get(t.code)).lines;
    for (const l of lines) if (l.gross_cents == null) await T.updateLine(t.code, l.id, { gross_cents: '90' });
    const paid = await T.pay(t.code, { tender: 'cash' });
    assert.equal(paid.status, 'paid');
    assert.equal(paid.referral.status, 'connected', JSON.stringify(paid.referral));
    assert.equal(paid.referral.jewels, 1);
    ref = await referralOf(nia.id);
    assert.equal(ref.referrer_client_id, referrer.id); assert.equal(ref.ticket_id, (await db.query('SELECT id FROM tickets WHERE code = $1', [t.code])).rows[0].id);

    const p = await R.profile(referrer.id);
    assert.equal(p.jewels.balance, 1);
    assert.equal(p.referred.length, 1); assert.equal(p.referred[0].client.name, 'Zq Nia New'); assert.equal(p.referred[0].status, 'connected');
    assert.equal(p.jewels.history[0].reason, 'referral');
    const theirs = await R.profile(nia.id);
    assert.equal(theirs.referredBy.referrer.id, referrer.id);

    // A second paid checkout doesn't pay out again: a person is referred once.
    const again = await ticketFor('Zq Nia New', 2);
    const paid2 = await T.pay(again.code, { tender: 'cash' });
    assert.equal(paid2.referral, null);
    assert.equal(await balance(referrer.id), 1);
  });

  test('booked at the desk: matched by email; a voided checkout takes the jewel back until the next one', async () => {
    const referrer = await client('Zq Erin Email', 3, 'erin.zq@example.com');
    const { any } = await B.availability({ serviceSlug: 'loc-retwist', variationId: RETWIST_V.id, date: DATE, stylistSlug: 'bethany', staff: true });
    const b = await desk('POST', { action: 'book', service: 'loc-retwist', variation: RETWIST_V.id, stylist: 'bethany', startAt: any[1],
      client: { name: 'Zq Dee Desk', phone: typed(4) }, referrer: { name: 'Erin', email: 'Erin.ZQ@example.com' } });
    assert.equal(b.statusCode, 201, JSON.stringify(b.body));
    const dee = (await db.query(`SELECT * FROM clients WHERE phone = $1`, [P(4)])).rows[0];
    assert.equal((await referralOf(dee.id)).source, 'desk');

    const t = await ticketFor('Zq Dee Desk', 4);
    const paid = await T.pay(t.code, { tender: 'card' });
    assert.equal(paid.referral.status, 'connected');
    assert.equal(await balance(referrer.id), 1);

    const voided = await T.voidTicket(t.code, 'rung by mistake');
    assert.equal(voided.referral.status, 'connected', 'the referral that was taken back');
    const ref = await referralOf(dee.id);
    assert.equal(ref.status, 'pending'); assert.equal(ref.referrer_client_id, referrer.id, 'still points at the referrer'); assert.equal(ref.jewels, 0);
    assert.equal(await balance(referrer.id), 0);
    assert.deepEqual((await R.profile(referrer.id)).jewels.history.map(h => [h.reason, h.delta]), [['reversed', -1], ['referral', 1]]);

    const t2 = await ticketFor('Zq Dee Desk', 4);
    assert.equal((await T.pay(t2.code, { tender: 'cash' })).referral.status, 'connected');
    assert.equal(await balance(referrer.id), 1);
  });

  test('unsure: two clients with the name → needs a match, and the desk picks the right one', async () => {
    const a = await client('Zq Twin Same', 5);
    const b = await client('Zq Twin Same', 6);
    const t = await ticketFor('Zq Mia Match', 7);
    const set = await desk('POST', { action: 'referral.set', code: t.code, given: { name: 'zq  twin same' } });
    assert.equal(set.statusCode, 200, JSON.stringify(set.body)); assert.equal(set.body.status, 'pending');
    const paid = await T.pay(t.code, { tender: 'cash' });
    assert.equal(paid.referral.status, 'needs_match');
    const list = await desk('GET', { action: 'referrals.list', status: 'needs_match' });
    const row = list.body.referrals.find(r => r.referred.name === 'Zq Mia Match');
    assert.ok(row); assert.equal(row.given.name, 'zq twin same');
    const st = await desk('GET', { action: 'referrals.status' });
    assert.ok(st.body.counts.needs_match >= 1);

    const pick = await desk('POST', { action: 'referral.pick', id: row.id, referrerClientId: b.id });
    assert.equal(pick.statusCode, 200, JSON.stringify(pick.body));
    assert.equal(pick.body.status, 'connected'); assert.equal(pick.body.referrer_client_id, b.id);
    assert.equal(await balance(b.id), 1); assert.equal(await balance(a.id), 0);
    // Connected is final.
    const again = await desk('POST', { action: 'referral.pick', id: row.id, referrerClientId: a.id });
    assert.equal(again.statusCode, 409);
  });

  test('a unique name connects; a name whose phone belongs to someone else does not', async () => {
    const solo = await client('Zq Solo Unique', 8);
    const t = await ticketFor('Zq Una Name', 9);
    await R.setForTicket(t.code, { given: { name: 'Zq Solo Unique' } });
    assert.equal((await T.pay(t.code, { tender: 'cash' })).referral.status, 'connected');
    assert.equal(await balance(solo.id), 1);

    await client('Zq Clash Name', 10);
    const t2 = await ticketFor('Zq Cy Clash', 11);
    await R.setForTicket(t2.code, { given: { name: 'Zq Clash Name', phone: '602-555-0999' } });      // not her number
    assert.equal((await T.pay(t2.code, { tender: 'cash' })).referral.status, 'needs_match');
  });

  test('at checkout: pick the referrer before or after paying; guards', async () => {
    const referrer = await client('Zq Kai Checkout', 12);
    const t = await ticketFor('Zq Lee Later', 13);
    const before = await desk('POST', { action: 'referral.set', code: t.code, referrerClientId: referrer.id });
    assert.equal(before.body.status, 'pending'); assert.equal(before.body.referrer_client_id, referrer.id);
    assert.equal((await T.pay(t.code, { tender: 'cash' })).referral.status, 'connected');
    assert.equal(await balance(referrer.id), 1);
    // Already connected: can't be changed.
    const change = await desk('POST', { action: 'referral.set', code: t.code, referrerClientId: referrer.id });
    assert.equal(change.statusCode, 409);

    // Added after the ticket was paid: connects straight away.
    const t2 = await ticketFor('Zq Pat Paidfirst', 14);
    await T.pay(t2.code, { tender: 'cash' });
    const after = await desk('POST', { action: 'referral.set', code: t2.code, given: { name: 'Kai', phone: typed(12) } });
    assert.equal(after.statusCode, 200, JSON.stringify(after.body)); assert.equal(after.body.status, 'connected');
    assert.equal(await balance(referrer.id), 2);

    // Guards: no client on the ticket, naming yourself, nothing given.
    const anon = await T.open({});
    assert.equal((await desk('POST', { action: 'referral.set', code: anon.code, given: { name: 'Kai' } })).statusCode, 400);
    const self = await ticketFor('Zq Sam Self', 15);
    const selfSet = await desk('POST', { action: 'referral.set', code: self.code, given: { name: 'Me', phone: typed(15) } });
    assert.equal(selfSet.statusCode, 400);
    const selfPick = await desk('POST', { action: 'referral.set', code: self.code, referrerClientId: self.client.id });
    assert.equal(selfPick.statusCode, 400);
    assert.equal((await desk('POST', { action: 'referral.set', code: self.code, given: {} })).statusCode, 400);
    assert.equal((await desk('POST', { action: 'referral.set', code: self.code, given: { name: 'X', phone: '12' } })).statusCode, 400);
    await T.voidTicket(anon.code); await T.voidTicket(self.code);
  });

  test('remove a referral given by mistake', async () => {
    await client('Zq Oops Referrer', 16);
    const t = await ticketFor('Zq Oli Oops', 17);
    await R.setForTicket(t.code, { given: { phone: typed(16) } });
    const r = await desk('POST', { action: 'referral.clear', clientId: t.client.id });
    assert.equal(r.statusCode, 200);
    assert.equal(await referralOf(t.client.id), undefined);
    assert.equal((await T.pay(t.code, { tender: 'cash' })).referral, null);
    assert.equal((await desk('POST', { action: 'referral.clear', clientId: t.client.id })).statusCode, 404);
  });

  test('Crown Jewels per referral is a setting; redeeming for merch never goes below zero', async () => {
    assert.equal((await desk('POST', { action: 'settings.save', referral_jewels: 1.5 })).statusCode, 400);
    assert.equal((await desk('POST', { action: 'settings.save', referral_jewels: 101 })).statusCode, 400);
    const s = await desk('POST', { action: 'settings.save', referral_jewels: 3 });
    assert.equal(s.statusCode, 200); assert.equal(s.body.referral_jewels, 3);
    const referrer = await client('Zq Gem Spender', 18);
    const t = await ticketFor('Zq Hal Three', 19);
    await R.setForTicket(t.code, { referrerClientId: referrer.id });
    assert.equal((await T.pay(t.code, { tender: 'cash' })).referral.jewels, 3);
    assert.equal(await balance(referrer.id), 3);
    await desk('POST', { action: 'settings.save', referral_jewels: 1 });

    assert.equal((await desk('POST', { action: 'jewels.redeem', clientId: referrer.id, jewels: 4, note: 'Hoodie' })).statusCode, 400);
    assert.equal((await desk('POST', { action: 'jewels.redeem', clientId: referrer.id, jewels: 1, note: '  ' })).statusCode, 400);
    assert.equal((await desk('POST', { action: 'jewels.redeem', clientId: referrer.id, jewels: 0.5, note: 'Pin' })).statusCode, 400);
    const r = await desk('POST', { action: 'jewels.redeem', clientId: referrer.id, jewels: 2, note: 'Crown Heirs tee' });
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    assert.equal(r.body.jewels.balance, 1);
    assert.deepEqual([r.body.jewels.history[0].reason, r.body.jewels.history[0].delta, r.body.jewels.history[0].note], ['redeemed', -2, 'Crown Heirs tee']);
    const prof = await desk('GET', { action: 'referral.client', id: referrer.id });
    assert.equal(prof.body.jewels.balance, 1);
  });

  test('client search finds clients here by name, phone or email', async () => {
    await client('Zq Searchable Sky', 20, 'sky.zq@example.com');
    for (const q of ['searchable sky', '555-0720', 'sky.zq@']) {
      const r = await desk('GET', { action: 'clients.search', q });
      assert.ok(r.body.clients.some(c => c.name === 'Zq Searchable Sky' && c.from === 'site'), q);
    }
    assert.deepEqual((await desk('GET', { action: 'clients.search', q: 'z' })).body.clients, []);
  });

  // ── Square ──
  // A fake Square: a customer directory, custom attribute definitions and
  // values, and payments.
  const SQ = { defs: [], attrs: {}, customers: {}, payments: [], writes: [] };
  const ok = (o) => ({ ok: true, status: 200, json: async () => o });
  const notFound = () => ({ ok: false, status: 404, json: async () => ({ errors: [{ code: 'NOT_FOUND', detail: 'not found' }] }) });
  function stubSquare() {
    square._setFetch(async (u, opts = {}) => {
      const m = opts.method || 'GET'; const body = opts.body ? JSON.parse(opts.body) : null;
      const path = u.replace(/^https:\/\/[^/]+/, ''); let x;
      if (m === 'GET' && /^\/v2\/customers\/custom-attribute-definitions/.test(path)) return ok({ custom_attribute_definitions: SQ.defs });
      if (m === 'POST' && path === '/v2/customers/custom-attribute-definitions') { SQ.defs.push(body.custom_attribute_definition); return ok({ custom_attribute_definition: body.custom_attribute_definition }); }
      if (m === 'POST' && path === '/v2/customers/search') {
        const f = body.query.filter;
        const list = Object.values(SQ.customers).filter(c => (f.phone_number ? c.phone_number === f.phone_number.exact : true) && (f.email_address ? c.email_address === f.email_address.exact : true));
        return ok({ customers: list });
      }
      if ((x = path.match(/^\/v2\/customers\/([^/?]+)\/custom-attributes\/([^/?]+)$/))) {
        const [, id, key] = x.map(decodeURIComponent);
        if (m === 'POST') { SQ.attrs[id + '|' + key] = body.custom_attribute.value; SQ.writes.push([id, key, body.custom_attribute.value]); return ok({ custom_attribute: { key, value: body.custom_attribute.value } }); }
        return SQ.attrs[id + '|' + key] == null ? notFound() : ok({ custom_attribute: { key, value: SQ.attrs[id + '|' + key] } });
      }
      if (m === 'GET' && /^\/v2\/customers\?/.test(path)) return ok({ customers: Object.values(SQ.customers) });
      if (m === 'GET' && (x = path.match(/^\/v2\/customers\/([^/?]+)$/))) { const c = SQ.customers[decodeURIComponent(x[1])]; return c ? ok({ customer: c }) : notFound(); }
      if (m === 'GET' && /^\/v2\/payments\?/.test(path)) {
        const q = new URL('https://x' + path).searchParams;
        assert.equal(q.get('location_id'), 'LOC-ZQ');
        return ok({ payments: SQ.payments.filter(p => p.created_at >= q.get('begin_time') && p.created_at < q.get('end_time')) });
      }
      return notFound();
    });
  }
  const sqCustomer = (id, given, family, n, email) => { SQ.customers[id] = { id, given_name: given, family_name: family, phone_number: n == null ? undefined : '+' + P(n), email_address: email }; return SQ.customers[id]; };

  test('Square: the cron and setup refuse politely until Square is connected', async () => {
    const no = await call(cronApi, req('GET'));
    assert.equal(no.statusCode, 401);
    const skip = await call(cronApi, req('GET', { headers: ADMIN }));
    assert.equal(skip.statusCode, 200); assert.match(skip.body.skipped, /not connected/);
    const setup = await desk('POST', { action: 'referrals.square.setup' });
    assert.equal(setup.statusCode, 400); assert.match(setup.body.error, /SQUARE_ACCESS_TOKEN/);
  });

  test('Square: setup adds the fields to customer profiles, reusing one made in the Dashboard', async () => {
    process.env.SQUARE_ACCESS_TOKEN = 'test-token'; process.env.SQUARE_LOCATION_ID = 'LOC-ZQ';
    stubSquare(); R._resetSquareCache();
    // Not set up yet: the cron skips, sync asks for setup.
    assert.match((await call(cronApi, req('GET', { headers: ADMIN }))).body.skipped, /not set up/);
    assert.equal((await desk('POST', { action: 'referrals.square.sync' })).statusCode, 400);

    SQ.defs.push({ key: 'square:abc-referred', name: 'Referred By', visibility: 'VISIBILITY_READ_WRITE_VALUES' });   // made by hand in the Dashboard
    const r = await desk('POST', { action: 'referrals.square.setup' });
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.found, ['Referred by']); assert.deepEqual(r.body.made, ['Crown Jewels', 'Referrals']);
    assert.equal(r.body.keys.referredBy, 'square:abc-referred');
    assert.ok(SQ.defs.every(d => !d.schema || d.schema.$ref.includes('squareup.common.String')));
    assert.equal(SQ.defs.find(d => d.key === 'crown-heirs-crown-jewels').visibility, 'VISIBILITY_READ_ONLY');
    // Running it again makes nothing new.
    const again = await desk('POST', { action: 'referrals.square.setup' });
    assert.deepEqual(again.body.made, []); assert.equal(SQ.defs.length, 3);
    const st = (await desk('GET', { action: 'referrals.status' })).body.square;
    assert.equal(st.connected, true); assert.equal(st.fields.referredBy, 'square:abc-referred'); assert.ok(st.since);
  });

  test('Square: after Square checkouts, "Referred by" is read and connected, and balances are written to Square', async () => {
    const since = new Date(Date.now() - 3600000).toISOString();
    await db.query(`UPDATE settings SET value = $1 WHERE key = 'referrals_square_since'`, [since]);
    const at = (min) => new Date(Date.now() - min * 60000).toISOString();
    // The referrer has only ever been in Square.
    sqCustomer('SQ-ZQ-REF', 'Zq Queen', 'Squareonly', 30, 'queen.zq@example.com');
    // A referrer who is a client here (by phone).
    const here = await client('Zq Harper Here', 31);
    // New clients who paid in Square, with "Referred by" filled in at checkout.
    sqCustomer('SQ-ZQ-A', 'Zq Ava', 'Square', 32); SQ.attrs['SQ-ZQ-A|square:abc-referred'] = 'Zq Queen Squareonly';
    sqCustomer('SQ-ZQ-B', 'Zq Bo', 'Square', 33); SQ.attrs['SQ-ZQ-B|square:abc-referred'] = `Harper ${typed(31)}`;
    sqCustomer('SQ-ZQ-C', 'Zq Cam', 'Square', 34);                                                    // no referral
    sqCustomer('SQ-ZQ-D', 'Zq Dot', 'Square', 35); SQ.attrs['SQ-ZQ-D|square:abc-referred'] = 'Somebody Unknown';
    SQ.payments.push(
      { id: 'PAY-A1', status: 'COMPLETED', customer_id: 'SQ-ZQ-A', created_at: at(50) },
      { id: 'PAY-A2', status: 'COMPLETED', customer_id: 'SQ-ZQ-A', created_at: at(40) },            // a second payment: counted once
      { id: 'PAY-B1', status: 'COMPLETED', customer_id: 'SQ-ZQ-B', created_at: at(30) },
      { id: 'PAY-C1', status: 'COMPLETED', customer_id: 'SQ-ZQ-C', created_at: at(20) },
      { id: 'PAY-D1', status: 'COMPLETED', customer_id: 'SQ-ZQ-D', created_at: at(15) },
      { id: 'PAY-X1', status: 'FAILED', customer_id: 'SQ-ZQ-C', created_at: at(10) },
      { id: 'PAY-OLD', status: 'COMPLETED', customer_id: 'SQ-ZQ-B', created_at: at(120) }           // before setup: not read
    );
    const r = await call(cronApi, req('GET', { headers: ADMIN }));
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    assert.deepEqual({ ...r.body, payments: undefined }, { payments: undefined, customers: 4, connected: 2, needsMatch: 1, alreadyConnected: 0, noReferral: 1, errors: [] });

    const queen = (await db.query(`SELECT * FROM clients WHERE square_customer_id = 'SQ-ZQ-REF'`)).rows[0];
    assert.ok(queen, 'the Square-only referrer is now a client here, linked to her Square profile');
    assert.equal(queen.phone, P(30));
    assert.equal(await balance(queen.id), 1);
    assert.equal(await balance(here.id), 1);
    const ava = (await db.query(`SELECT * FROM clients WHERE square_customer_id = 'SQ-ZQ-A'`)).rows[0];
    const ref = await referralOf(ava.id);
    assert.equal(ref.source, 'square'); assert.equal(ref.square_payment_id, 'PAY-A1'); assert.equal(ref.referrer_client_id, queen.id);
    // Written to Queen's Square profile so staff see it in Square.
    assert.equal(SQ.attrs['SQ-ZQ-REF|crown-heirs-crown-jewels'], '1');
    assert.equal(SQ.attrs['SQ-ZQ-REF|crown-heirs-referrals'], '1');
    const dot = (await db.query(`SELECT * FROM clients WHERE square_customer_id = 'SQ-ZQ-D'`)).rows[0];
    assert.equal((await referralOf(dot.id)).status, 'needs_match');

    // The next run starts where this one ended: nothing new, nothing paid twice.
    const next = await desk('POST', { action: 'referrals.square.sync' });
    assert.equal(next.statusCode, 200); assert.equal(next.body.customers, 0);
    assert.equal(await balance(queen.id), 1);
    const st = (await desk('GET', { action: 'referrals.status' })).body.square;
    assert.equal(st.last.connected, 0); assert.equal(st.last.customers, 0);

    // Redeeming at the desk updates Square too.
    SQ.writes.length = 0;
    await desk('POST', { action: 'jewels.redeem', clientId: queen.id, jewels: 1, note: 'Crown Heirs mug' });
    assert.deepEqual(SQ.writes.find(w => w[1] === 'crown-heirs-crown-jewels'), ['SQ-ZQ-REF', 'crown-heirs-crown-jewels', '0']);
  });

  test('Square: the desk can pick a referrer straight from Square\'s directory, and search shows them', async () => {
    sqCustomer('SQ-ZQ-PICK', 'Zq Pickme', 'Fromsquare', 40);
    R._resetSquareCache();
    const found = await desk('GET', { action: 'clients.search', q: 'zq pickme' });
    const hit = found.body.clients.find(c => c.squareCustomerId === 'SQ-ZQ-PICK');
    assert.ok(hit); assert.equal(hit.from, 'square'); assert.equal(hit.id, null);
    const t = await ticketFor('Zq Ren Referred', 41);
    const set = await desk('POST', { action: 'referral.set', code: t.code, referrerSquareId: 'SQ-ZQ-PICK' });
    assert.equal(set.statusCode, 200, JSON.stringify(set.body));
    const pick = (await db.query(`SELECT * FROM clients WHERE square_customer_id = 'SQ-ZQ-PICK'`)).rows[0];
    assert.equal(set.body.referrer_client_id, pick.id);
    assert.equal((await T.pay(t.code, { tender: 'cash' })).referral.status, 'connected');
    assert.equal(SQ.attrs['SQ-ZQ-PICK|crown-heirs-crown-jewels'], '1');
    // Now a client here, found as one.
    const again = await desk('GET', { action: 'clients.search', q: 'zq pickme' });
    assert.deepEqual(again.body.clients.filter(c => /Pickme/.test(c.name)).map(c => c.from), ['site']);
  });
}
