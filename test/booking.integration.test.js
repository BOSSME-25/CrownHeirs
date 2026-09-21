// Integration test against a real Postgres. Skipped unless TEST_DATABASE_URL is set.
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5433/crownheirs node --test
const test = require('node:test');
const assert = require('node:assert/strict');

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  test('booking integration (skipped: no TEST_DATABASE_URL)', { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = url;
  const db = require('../lib/db');
  const { migrate, seed } = require('../lib/setup');
  const B = require('../lib/booking');
  const { addDays, todayIn, weekdayOf } = require('../lib/tz');

  // A Tuesday at least 3 days out, so lead time never interferes.
  function nextTuesday() {
    let d = addDays(todayIn('America/Phoenix'), 3);
    while (weekdayOf(d) !== 2) d = addDays(d, 1);
    return d;
  }
  const client = { name: 'Test Client', phone: '(602) 555-0142', email: 'test@example.com' };

  test.before(async () => {
    await migrate();
    await seed();
    await db.query(`DELETE FROM appointments WHERE client_id IN (SELECT id FROM clients WHERE phone LIKE '1602555%')`);
    await db.query(`DELETE FROM clients WHERE phone LIKE '1602555%'`);
  });
  test.after(async () => { await db.getPool().end(); });

  test('catalog loads, grouped by category', async () => {
    const cats = await B.listServices();
    assert.ok(cats.length >= 6);
    assert.ok(cats.some(c => c.services.some(s => s.slug === 'loc-retwist')));
  });

  test('availability, booking, double-booking rejection, lookup, cancel', async () => {
    const date = nextTuesday();
    const before = await B.availability({ serviceSlug: 'loc-retwist', date });
    assert.ok(before.any.length > 10, 'open day has slots');
    const startAt = before.any[4];

    const appt = await B.createAppointment({ serviceSlug: 'loc-retwist', stylistSlug: 'any', startAt, client, notes: 'first visit' });
    assert.match(appt.code, /^CH-[A-Z2-9]{5}$/);
    assert.equal(new Date(appt.startsAt).toISOString(), startAt);

    const after = await B.availability({ serviceSlug: 'loc-retwist', date });
    assert.ok(!after.any.includes(startAt), 'booked slot disappears');
    assert.ok(after.any.length < before.any.length);

    // Same slot again — the engine catches it first (409)…
    await assert.rejects(
      () => B.createAppointment({ serviceSlug: 'loc-retwist', stylistSlug: 'any', startAt, client }),
      (e) => e.status === 409
    );
    // …and even if the engine were bypassed, the DB constraint refuses the overlap.
    await assert.rejects(
      () => db.query(
        `INSERT INTO appointments (code, stylist_id, service_id, client_id, starts_at, ends_at, busy_until)
         SELECT 'CH-TEST1', stylist_id, service_id, client_id, starts_at, ends_at, busy_until FROM appointments WHERE code = $1`,
        [appt.code]
      ),
      (e) => e.code === '23P01'
    );

    const found = await B.lookup(appt.code.toLowerCase());
    assert.equal(found.service.slug, 'loc-retwist');
    assert.equal(found.client.phoneLast4, '0142');
    assert.equal(found.status, 'confirmed');

    await B.cancel(appt.code);
    const again = await B.availability({ serviceSlug: 'loc-retwist', date });
    assert.ok(again.any.includes(startAt), 'cancelled slot comes back');
    await assert.rejects(() => B.cancel(appt.code), (e) => e.status === 409);
  });

  test('a race for one slot produces exactly one booking', async () => {
    const date = nextTuesday();
    const { any } = await B.availability({ serviceSlug: 'silk-press', date });
    const startAt = any[any.length - 1];
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => B.createAppointment({
        serviceSlug: 'silk-press', stylistSlug: 'any', startAt,
        client: { name: 'Racer ' + i, phone: '602555010' + i }
      }))
    );
    const ok = results.filter(r => r.status === 'fulfilled');
    const conflicts = results.filter(r => r.status === 'rejected' && r.reason.status === 409 || (r.status === 'rejected' && r.reason.code === '23P01'));
    assert.equal(ok.length, 1, 'exactly one winner');
    assert.equal(conflicts.length, 5, 'everyone else told the slot is gone');
    await B.cancel(ok[0].value.code);
  });

  test('validation: bad phone, bad date, unknown service', async () => {
    const date = nextTuesday();
    await assert.rejects(() => B.createAppointment({ serviceSlug: 'loc-retwist', startAt: new Date().toISOString(), client: { name: 'X Y', phone: '123' } }), (e) => e.status === 400);
    await assert.rejects(() => B.availability({ serviceSlug: 'loc-retwist', date: '2020-01-01' }), (e) => e.status === 400);
    await assert.rejects(() => B.availability({ serviceSlug: 'nope', date }), (e) => e.status === 404);
    assert.equal(B.normalizePhone('602-555-0100'), '16025550100');
  });
}
