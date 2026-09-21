// Drives the HTTP handlers the way Vercel does (req.query / req.body / res.*),
// so status codes and JSON shapes are verified, not just the library.
// Needs TEST_DATABASE_URL like the integration test.
const test = require('node:test');
const assert = require('node:assert/strict');

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  test('api smoke (skipped: no TEST_DATABASE_URL)', { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = url;
  process.env.ADMIN_PASSWORD = 'test-admin-key';
  const db = require('../lib/db');
  const { addDays, todayIn, weekdayOf } = require('../lib/tz');
  const H = {
    services: require('../api/book/services'),
    availability: require('../api/book/availability'),
    create: require('../api/book/create'),
    lookup: require('../api/book/lookup'),
    setup: require('../api/book/setup')
  };

  const req = (method, { query = {}, body, headers = {} } = {}) => ({ method, query, body, headers });
  const res = () => ({
    statusCode: 200, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; },
    send(b) { this.body = b; return this; }
  });
  const call = async (h, r) => { const s = res(); await h(r, s); return s; };
  const ADMIN = { 'x-admin-key': 'test-admin-key' };

  function nextTuesday() {
    let d = addDays(todayIn('America/Phoenix'), 3);
    while (weekdayOf(d) !== 2) d = addDays(d, 1);
    return d;
  }

  test.before(async () => {
    const s = await call(H.setup, req('POST', { headers: ADMIN }));
    assert.equal(s.statusCode, 200, JSON.stringify(s.body));
    await db.query(`DELETE FROM appointments WHERE client_id IN (SELECT id FROM clients WHERE phone = '16025559999')`);
    await db.query(`DELETE FROM clients WHERE phone = '16025559999'`);
  });
  test.after(async () => { await db.getPool().end(); });

  test('setup: 401 without key, counts with key', async () => {
    assert.equal((await call(H.setup, req('GET'))).statusCode, 401);
    const s = await call(H.setup, req('GET', { headers: ADMIN }));
    assert.equal(s.statusCode, 200);
    assert.ok(s.body.services >= 60 && s.body.stylists >= 1);
  });

  test('services: grouped catalog with timezone', async () => {
    const s = await call(H.services, req('GET'));
    assert.equal(s.statusCode, 200);
    assert.equal(s.body.timeZone, 'America/Phoenix');
    assert.ok(s.body.categories.length >= 6);
    assert.ok(s.body.categories.every(c => c.services.length > 0));
    assert.equal((await call(H.services, req('POST'))).statusCode, 405);
  });

  test('availability: validation and shape', async () => {
    assert.equal((await call(H.availability, req('GET'))).statusCode, 400);
    assert.equal((await call(H.availability, req('GET', { query: { service: 'nope', date: nextTuesday() } }))).statusCode, 404);
    const s = await call(H.availability, req('GET', { query: { service: 'silk-press', date: nextTuesday() } }));
    assert.equal(s.statusCode, 200);
    assert.equal(s.headers['Cache-Control'], 'no-store');
    assert.ok(Array.isArray(s.body.any) && s.body.any.length > 0);
    assert.ok(s.body.stylists[0].slots.length > 0);
  });

  test('create → lookup → cancel through the handlers', async () => {
    const date = nextTuesday();
    const a = await call(H.availability, req('GET', { query: { service: 'silk-press', date } }));
    const startAt = a.body.any[2];

    assert.equal((await call(H.create, req('POST', { body: {} }))).statusCode, 404, 'no service → 404');
    const bad = await call(H.create, req('POST', { body: { service: 'silk-press', startAt, client: { name: 'A', phone: '1' } } }));
    assert.equal(bad.statusCode, 400);

    const c = await call(H.create, req('POST', { body: {
      service: 'silk-press', stylist: 'any', startAt,
      client: { name: 'Smoke Test', phone: '602-555-9999', email: 'smoke@example.com' }, notes: 'via handler'
    } }));
    assert.equal(c.statusCode, 201, JSON.stringify(c.body));
    assert.match(c.body.code, /^CH-/);

    const dup = await call(H.create, req('POST', { body: { service: 'silk-press', startAt, client: { name: 'Smoke Test', phone: '602-555-9999' } } }));
    assert.equal(dup.statusCode, 409);

    const l = await call(H.lookup, req('GET', { query: { code: c.body.code.toLowerCase() } }));
    assert.equal(l.statusCode, 200);
    assert.equal(l.body.status, 'confirmed');
    assert.equal(l.body.client.phoneLast4, '9999');

    const x = await call(H.lookup, req('POST', { body: { code: c.body.code, action: 'cancel' } }));
    assert.equal(x.statusCode, 200);
    assert.equal(x.body.status, 'cancelled');
    assert.equal((await call(H.lookup, req('GET', { query: { code: 'CH-NOPE1' } }))).statusCode, 404);
  });

  test('no database → 503 with an actionable message', async () => {
    // Fresh module instances with the env cleared, so getPool() has nothing to connect to.
    const saved = process.env.DATABASE_URL; delete process.env.DATABASE_URL;
    for (const k of Object.keys(require.cache)) if (/\/lib\/|\/api\/book\//.test(k)) delete require.cache[k];
    const services = require('../api/book/services');
    const s = await call(services, req('GET'));
    assert.equal(s.statusCode, 503);
    assert.match(s.body.error, /Storage → Create Database/);
    process.env.DATABASE_URL = saved;
    for (const k of Object.keys(require.cache)) if (/\/lib\/|\/api\/book\//.test(k)) delete require.cache[k];
  });
}
