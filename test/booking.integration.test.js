// Integration test against a real Postgres. Skipped unless TEST_DATABASE_URL is set.
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5433/crownheirs node --test
const test = require('node:test');
const assert = require('node:assert/strict');

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  test('booking integration (skipped: no TEST_DATABASE_URL)', { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = url;
  process.env.BOOKING_MODE = 'site';
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
  let RETWIST, RETWIST_V, PONY, PONY_V;   // looked up from the catalog, not hard-coded

  test.before(async () => {
    await migrate();
    await seed();
    // Tickets reference appointments (and refunds reference tickets), so they go first.
    // Only this suite's own numbers (0142 and the race test's 0100–0105) —
    // suites run in parallel, so a broad LIKE would delete another suite's rows mid-run.
    const phones = `SELECT id FROM clients WHERE phone = '16025550142' OR phone LIKE '160255501__'`;
    const mine = `SELECT id FROM appointments WHERE client_id IN (${phones})`;
    await db.query(`DELETE FROM ticket_refunds WHERE ticket_id IN (SELECT id FROM tickets WHERE appointment_id IN (${mine}))`);
    await db.query(`DELETE FROM tickets WHERE appointment_id IN (${mine})`);
    await db.query(`DELETE FROM appointments WHERE id IN (${mine})`);
    await db.query(`DELETE FROM clients WHERE id IN (${phones})`);
    const all = (await B.listServices()).flatMap(c => c.services);
    RETWIST = all.find(s => s.slug === 'loc-retwist');
    PONY = all.find(s => s.slug === 'sleek-ponytail');
    // Exact name: "Microlocs (New Client/Over 45 days)" also contains "New Client" and sorts first.
    RETWIST_V = RETWIST.variations.find(v => v.name === 'New Client') || RETWIST.variations[0];
    PONY_V = PONY.variations[0];
  });
  test.after(async () => { await db.getPool().end(); });

  test('catalog: grouped, every offered service has bookable variations with real durations', async () => {
    const cats = await B.listServices();
    assert.ok(cats.length >= 8);
    const all = cats.flatMap(c => c.services);
    assert.ok(all.length >= 55, `expected the Square catalog, got ${all.length}`);
    assert.ok(all.every(s => s.variations.length > 0));
    assert.ok(RETWIST.variations.length >= 5, 'Loc Retwist has several client types');
    assert.equal(RETWIST_V.duration_min, 90);
    assert.ok(!all.some(s => /threading|classes|back ii school/i.test(s.name)), 'not-bookable-online services are not offered');
  });

  test('a multi-option service requires the variation; single-option does not', async () => {
    const date = nextTuesday();
    await assert.rejects(() => B.availability({ serviceSlug: 'loc-retwist', date }), (e) => e.status === 400 && /size or length/.test(e.message));
    await assert.rejects(() => B.availability({ serviceSlug: 'loc-retwist', variationId: 999999, date }), (e) => e.status === 404);
    const single = (await B.listServices()).flatMap(c => c.services).find(s => s.variations.length === 1);
    const a = await B.availability({ serviceSlug: single.slug, date });
    assert.equal(a.variation.id, single.variations[0].id);
  });

  test('availability, booking, double-booking rejection, lookup, cancel', async () => {
    const date = nextTuesday();
    const before = await B.availability({ serviceSlug: 'loc-retwist', variationId: RETWIST_V.id, date, stylistSlug: 'bethany' });
    assert.ok(before.any.length > 10, 'open day has slots');
    const startAt = before.any[4];

    const appt = await B.createAppointment({ serviceSlug: 'loc-retwist', variationId: RETWIST_V.id, stylistSlug: 'bethany', startAt, client, notes: 'first visit' });
    assert.match(appt.code, /^CH-[A-Z2-9]{5}$/);
    assert.equal(new Date(appt.startsAt).toISOString(), startAt);
    assert.equal(appt.variation.name, RETWIST_V.name);
    assert.equal((new Date(appt.endsAt) - new Date(appt.startsAt)) / 60000, RETWIST_V.duration_min, 'length comes from the variation');

    const after = await B.availability({ serviceSlug: 'loc-retwist', variationId: RETWIST_V.id, date, stylistSlug: 'bethany' });
    assert.ok(!after.any.includes(startAt), 'booked slot disappears');
    assert.ok(after.any.length < before.any.length);

    // Same slot again — the engine catches it first (409)…
    await assert.rejects(
      () => B.createAppointment({ serviceSlug: 'loc-retwist', variationId: RETWIST_V.id, stylistSlug: 'bethany', startAt, client }),
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
    assert.equal(found.variation.name, RETWIST_V.name);
    assert.equal(found.client.phoneLast4, '0142');
    assert.equal(found.status, 'confirmed');

    await B.cancel(appt.code);
    const again = await B.availability({ serviceSlug: 'loc-retwist', variationId: RETWIST_V.id, date, stylistSlug: 'bethany' });
    assert.ok(again.any.includes(startAt), 'cancelled slot comes back');
    await assert.rejects(() => B.cancel(appt.code), (e) => e.status === 409);
  });

  test('a race for one slot produces exactly one booking', async () => {
    const date = nextTuesday();
    const { any } = await B.availability({ serviceSlug: PONY.slug, variationId: PONY_V.id, date, stylistSlug: 'bethany' });
    const startAt = any[any.length - 1];
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => B.createAppointment({
        serviceSlug: PONY.slug, variationId: PONY_V.id, stylistSlug: 'bethany', startAt,
        client: { name: 'Racer ' + i, phone: '602555010' + i }
      }))
    );
    const ok = results.filter(r => r.status === 'fulfilled');
    const conflicts = results.filter(r => r.status === 'rejected' && (r.reason.status === 409 || r.reason.code === '23P01'));
    assert.equal(ok.length, 1, 'exactly one winner');
    assert.equal(conflicts.length, 5, 'everyone else told the slot is gone');
    await B.cancel(ok[0].value.code);
  });

  test('re-running seed is idempotent and keeps an edited price', async () => {
    await db.query(`UPDATE services SET price_from_cents = 12345 WHERE slug = 'loc-retwist'`);
    const r = await seed();
    assert.ok(r.services >= 60 && r.variations >= 300);
    const { rows: [s] } = await db.query(`SELECT price_from_cents FROM services WHERE slug = 'loc-retwist'`);
    assert.equal(s.price_from_cents, 12345, 'seed never overwrites a price that exists');
    const { rows: [n] } = await db.query(`SELECT count(*) n FROM service_variations WHERE service_id = (SELECT id FROM services WHERE slug='loc-retwist')`);
    assert.equal(Number(n.n), RETWIST.variations.length, 'no duplicate variations after re-seed');
  });

  test('validation: bad phone, bad date, unknown service', async () => {
    const date = nextTuesday();
    await assert.rejects(() => B.createAppointment({ serviceSlug: 'loc-retwist', variationId: RETWIST_V.id, startAt: new Date().toISOString(), client: { name: 'X Y', phone: '123' } }), (e) => e.status === 400);
    await assert.rejects(() => B.availability({ serviceSlug: 'loc-retwist', variationId: RETWIST_V.id, date: '2020-01-01' }), (e) => e.status === 400);
    await assert.rejects(() => B.availability({ serviceSlug: 'nope', date }), (e) => e.status === 404);
    assert.equal(B.normalizePhone('602-555-0100'), '16025550100');
  });
}
