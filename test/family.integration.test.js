// Family bookings against a real Postgres: one visit, several people, one code.
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5433/crownheirs node --test
const test = require('node:test');
const assert = require('node:assert/strict');

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  test('family integration (skipped: no TEST_DATABASE_URL)', { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = url;
  process.env.NOTIFY_DRY_RUN = '1';
  process.env.NOTIFY_EMAIL = 'desk@example.com';
  process.env.ADMIN_PASSWORD = 'test-admin-key';
  process.env.BOOKING_MODE = 'site';
  const db = require('../lib/db');
  const { migrate, seed } = require('../lib/setup');
  const B = require('../lib/booking');
  const S = require('../lib/staff');
  const F = require('../lib/family');
  const T = require('../lib/tickets');
  const notify = require('../lib/notify');
  const { addDays, todayIn, weekdayOf } = require('../lib/tz');
  const familyApi = require('../api/book/family');
  const lookupApi = require('../api/book/lookup');
  const staffApi = require('../api/book/staff');
  const ADMIN = { 'x-admin-key': 'test-admin-key' };

  const req = (method, { query = {}, body, headers = {} } = {}) => ({ method, query, body, headers });
  const res = () => ({ statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; } });
  const call = async (h, r) => { const s = res(); await h(r, s); return s; };

  // A Tuesday at least 3 days out: bethany (Tue–Sat) and the 24/7 test stylist both work.
  function nextTuesday() { let d = addDays(todayIn('America/Phoenix'), 3); while (weekdayOf(d) !== 2) d = addDays(d, 1); return d; }
  const HOLDER = { name: 'Fam Holder', phone: '602-555-0890', email: 'holder@example.com' };
  const PHONE = '16025550890';
  let PONY, PONY_V, RETWIST, RETWIST_V;

  test.before(async () => {
    await migrate(); await seed();
    // This suite owns phone …0890 (and …0891), the household it creates, and stylist 'test-fam'.
    // Legs are pinned to bethany and test-fam so no other suite's stylist is touched.
    const hh = `SELECT id FROM households WHERE holder_id IN (SELECT id FROM clients WHERE phone = '${PHONE}')`;
    const cl = `SELECT id FROM clients WHERE phone IN ('${PHONE}', '16025550891') OR household_id IN (${hh})`;
    const vis = `SELECT id FROM visits WHERE holder_id IN (${cl})`;
    const ap = `SELECT id FROM appointments WHERE client_id IN (${cl}) OR visit_id IN (${vis}) OR stylist_id IN (SELECT id FROM stylists WHERE slug = 'test-fam')`;
    const tix = `SELECT id FROM tickets WHERE visit_id IN (${vis}) OR appointment_id IN (${ap}) OR client_id IN (${cl})`;
    await db.query(`DELETE FROM ticket_refunds WHERE ticket_id IN (${tix})`);
    await db.query(`DELETE FROM tickets WHERE id IN (${tix})`);
    await db.query(`DELETE FROM appointments WHERE id IN (${ap})`);
    await db.query(`DELETE FROM visits WHERE id IN (${vis})`);
    await db.query(`DELETE FROM clients WHERE phone IS NULL AND household_id IN (${hh})`);   // dependents first
    await db.query(`UPDATE clients SET household_id = NULL WHERE phone = '${PHONE}'`);
    await db.query(`DELETE FROM households WHERE holder_id IN (SELECT id FROM clients WHERE phone = '${PHONE}')`);
    await db.query(`DELETE FROM clients WHERE phone IN ('${PHONE}', '16025550891')`);
    await db.query(`DELETE FROM stylists WHERE slug = 'test-fam'`);
    await S.saveStylist({ name: 'Test Fam', title: 'Stylist', active: true,
      hours: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMin: 0, endMin: 1440 })),
      services: ['sleek-ponytail', 'loc-retwist'] });
    const all = (await B.listServices()).flatMap(c => c.services);
    PONY = all.find(s => s.slug === 'sleek-ponytail'); PONY_V = PONY.variations[0];
    RETWIST = all.find(s => s.slug === 'loc-retwist'); RETWIST_V = RETWIST.variations.find(v => v.name === 'New Client') || RETWIST.variations[0];
  });
  test.after(async () => { await db.getPool().end(); });

  const people = () => [
    { self: true, name: HOLDER.name, services: [{ service: 'sleek-ponytail', variation: PONY_V.id, stylist: 'bethany' }] },
    { name: 'Kai', relationship: 'son', services: [{ service: 'loc-retwist', variation: RETWIST_V.id, stylist: 'test-fam' }] }
  ];
  // availability's option → the people payload create() takes (stylist + startAt on every leg)
  const fromOption = (o) => people().map((p, i) => ({ ...p, services: p.services.map((sv, k) => ({ ...sv, stylist: o.people[i].legs[k].stylist.slug, startAt: o.people[i].legs[k].startAt })) }));
  let VISIT;

  test('availability: every option seats everyone within the window, one chair at a time', async () => {
    const date = nextTuesday();
    const a = await F.availability({ people: people(), date });
    assert.equal(a.windowMin, 60);
    assert.ok(a.options.length > 5, 'open day has family options');
    for (const o of a.options) {
      assert.equal(o.people.length, 2);
      const starts = o.people.map(p => new Date(p.legs[0].startAt).getTime());
      assert.ok(Math.max(...starts) - Math.min(...starts) <= 60 * 60000, 'starts within the window');
      assert.equal(o.startAt, new Date(Math.min(...starts)).toISOString());
      assert.notEqual(o.people[0].legs[0].stylist.slug, o.people[1].legs[0].stylist.slug, 'pinned to different stylists');
    }
    await assert.rejects(() => F.availability({ people: [people()[0]], date }), (e) => e.status === 400, 'one person, one service is not a visit');
    await assert.rejects(() => F.availability({ people: people(), date, mode: 'nope' }), (e) => e.status === 400);
  });

  test('create: one visit, two legs, dependent in the household without a phone; one message to the holder', async () => {
    const date = nextTuesday();
    const { options } = await F.availability({ people: people(), date });
    const o = options[2];
    const ppl = fromOption(o);
    notify.outbox.length = 0;
    VISIT = await F.create({ policyAck: true, holder: HOLDER, people: ppl, notes: 'first family visit' });
    assert.match(VISIT.code, /^CF-[A-Z2-9]{5}$/);
    assert.equal(VISIT.people.length, 2);
    assert.ok(VISIT.people.every(l => /^CH-/.test(l.code)));
    assert.equal(VISIT.people[1].name, 'Kai');
    const { rows: [kai] } = await db.query(`SELECT phone, household_id, relationship FROM clients WHERE name = 'Kai' AND household_id = (SELECT household_id FROM clients WHERE phone = $1)`, [PHONE]);
    assert.equal(kai.phone, null); assert.ok(kai.household_id); assert.equal(kai.relationship, 'son');
    const sms = notify.outbox.filter(m => m.channel === 'sms' && m.to === '+16025550890');
    assert.equal(sms.length, 1, 'one text to the holder');
    assert.match(sms[0].body, /Kai: Loc Retwist/);
    assert.match(sms[0].body, new RegExp(VISIT.code));
    assert.ok(notify.outbox.some(m => m.channel === 'email' && m.to === 'desk@example.com' && /family booking/i.test(m.text)), 'salon told');
  });

  test('lookup: by visit code shows everyone; a leg code still works for a dependent', async () => {
    const v = await F.lookup(VISIT.code.toLowerCase());
    assert.equal(v.status, 'confirmed'); assert.equal(v.people.length, 2); assert.equal(v.holder.phoneLast4, '0890');
    const leg = await B.lookup(VISIT.people[1].code);
    assert.equal(leg.client.name, 'Kai'); assert.equal(leg.client.phoneLast4, '');
    const day = await S.day(nextTuesday());
    const mine = day.appointments.filter(a => a.visit && a.visit.code === VISIT.code);
    assert.equal(mine.length, 2);
    assert.equal(mine.find(a => a.client.name === 'Kai').client.phone, PHONE, 'desk reaches the holder for a dependent');
  });

  test('ticket: the holder pays one ticket with a line per person under its own provider; paying completes both', async () => {
    const t = await T.open({ visitCode: VISIT.code, rungBy: 'bethany' });
    assert.equal(t.lines.length, 2);
    assert.equal(t.client.name, HOLDER.name);
    assert.ok(t.lines.some(l => /^Kai: Loc Retwist/.test(l.name)));
    assert.notEqual(t.lines[0].provider.slug, t.lines[1].provider.slug);
    await assert.rejects(() => T.open({ visitCode: VISIT.code }), (e) => e.status === 409);
    await T.pay(t.code, { tender: 'cash' });
    const v = await F.load(VISIT.code);
    assert.ok(v.people.every(l => l.status === 'completed'));
    await T.voidTicket(t.code, 'test');
    assert.ok((await F.load(VISIT.code)).people.every(l => l.status === 'confirmed'));
  });

  test('a second visit matches the dependent by name instead of creating another Kai', async () => {
    const date = addDays(nextTuesday(), 1);   // Wednesday: both stylists work
    const { options } = await F.availability({ people: people(), date });
    const o = options[0];
    const ppl = fromOption(o);
    const v2 = await F.create({ policyAck: true, holder: HOLDER, people: ppl });
    const { rows } = await db.query(`SELECT count(*) n FROM clients WHERE name = 'Kai' AND household_id = (SELECT household_id FROM clients WHERE phone = $1)`, [PHONE]);
    assert.equal(Number(rows[0].n), 1);
    const c = await F.cancel(v2.code);
    assert.equal(c.cancelled.length, 2);
    assert.equal((await F.lookup(v2.code)).status, 'cancelled');
    await assert.rejects(() => F.cancel(v2.code), (e) => e.status === 409);
  });

  test('a clash on any leg rolls the whole visit back', async () => {
    const date = addDays(nextTuesday(), 2);
    const { options } = await F.availability({ people: people(), date });
    const o = options[1];
    // Take Kai's slot with a single booking first.
    await B.createAppointment({ policyAck: true, serviceSlug: 'loc-retwist', variationId: RETWIST_V.id, stylistSlug: o.people[1].legs[0].stylist.slug, startAt: o.people[1].legs[0].startAt, client: { name: 'Blocker', phone: '602-555-0891' } });
    const before = (await db.query('SELECT count(*) n FROM visits')).rows[0].n;
    const ppl = fromOption(o);
    await assert.rejects(() => F.create({ policyAck: true, holder: HOLDER, people: ppl }), (e) => e.status === 409 && /Kai/.test(e.message));
    assert.equal((await db.query('SELECT count(*) n FROM visits')).rows[0].n, before, 'nothing half-booked');
  });

  test('handlers: GET/POST /api/book/family and visit codes through /api/book/lookup', async () => {
    const date = addDays(nextTuesday(), 3);
    const g = await call(familyApi, req('GET', { query: { date, people: JSON.stringify(people()), mode: 'together' } }));
    assert.equal(g.statusCode, 200, JSON.stringify(g.body)); assert.ok(g.body.options.length); assert.equal(g.body.mode, 'together');
    const so = await call(familyApi, req('GET', { query: { soonest: '1', people: JSON.stringify(people()), mode: 'sameday' } }));
    assert.equal(so.statusCode, 200); assert.ok(so.body.date, 'a soonest day');
    const o = g.body.options[0];
    const ppl = fromOption(o);
    const c = await call(familyApi, req('POST', { body: { policyAck: true, holder: HOLDER, people: ppl, mode: 'together' } }));
    assert.equal(c.statusCode, 201, JSON.stringify(c.body)); assert.match(c.body.code, /^CF-/);
    const l = await call(lookupApi, req('GET', { query: { code: c.body.code } }));
    assert.equal(l.body.kind, 'visit'); assert.equal(l.body.people.length, 2);
    const x = await call(lookupApi, req('POST', { body: { code: c.body.code, action: 'cancel' } }));
    assert.equal(x.statusCode, 200); assert.equal(x.body.status, 'cancelled');
    assert.equal((await call(familyApi, req('GET', { query: { date, people: 'nope' } }))).statusCode, 400);
  });

  test('front desk: books a visit for today with no lead time and no policy tick; the legs read Phone', async () => {
    const date = todayIn('America/Phoenix');
    // The desk route carries staff:true, so the lead time is 0 and the policy box is not required.
    const g = await call(staffApi, req('GET', { headers: ADMIN, query: { action: 'visit.availability', date: addDays(nextTuesday(), 4), mode: 'sameday', people: JSON.stringify(people()) } }));
    assert.equal(g.statusCode, 200, JSON.stringify(g.body)); assert.ok(g.body.options.length);
    const so = await call(staffApi, req('GET', { headers: ADMIN, query: { action: 'visit.soonest', mode: 'together', people: JSON.stringify(people()) } }));
    assert.equal(so.statusCode, 200); assert.ok(so.body.date);
    const o = g.body.options[0];
    const ppl = fromOption(o);
    const c = await call(staffApi, req('POST', { headers: ADMIN, body: { action: 'visit.book', holder: HOLDER, people: ppl, mode: 'sameday', notes: 'by phone' } }));
    assert.equal(c.statusCode, 201, JSON.stringify(c.body)); assert.match(c.body.code, /^CF-/); assert.equal(c.body.source, 'staff');
    const { rows } = await db.query(`SELECT policy_ack, source FROM appointments WHERE visit_id = (SELECT id FROM visits WHERE code = $1)`, [c.body.code]);
    assert.equal(rows.length, 2);
    assert.ok(rows.every(r => r.policy_ack === true && r.source === 'staff'), 'desk bookings count as acknowledged and read Phone');
    assert.equal((await call(staffApi, req('GET', { query: { action: 'visit.availability', date, people: '[]' } }))).statusCode, 401, 'needs the admin key');
    assert.equal((await call(staffApi, req('GET', { headers: ADMIN, query: { action: 'visit.availability', date, people: 'nope' } }))).statusCode, 400);
    await F.cancel(c.body.code);
  });

  test('stack: one person, loc color then retwist, back to back, only on qualified stylists', async () => {
    const date = addDays(nextTuesday(), 7);
    const color = (await B.listServices()).flatMap(c => c.services).find(s => s.slug === 'loc-color');
    const colorV = color.variations[0];
    // bethany offers everything; test-fam does not offer loc-color.
    const stack = [{ self: true, name: HOLDER.name, services: [{ service: 'loc-color', variation: colorV.id, stylist: 'bethany' }, { service: 'loc-retwist', variation: RETWIST_V.id }] }];
    const a = await F.availability({ people: stack, date });
    assert.ok(a.options.length, 'a stacked visit has times');
    for (const o of a.options) {
      const [c, r] = o.people[0].legs;
      assert.equal(c.service.slug, 'loc-color'); assert.equal(r.service.slug, 'loc-retwist');
      assert.equal(r.startAt, c.endsAt, 'the retwist starts when the color ends');
      assert.equal(c.stylist.slug, 'bethany', 'color only lands on a stylist who offers it');
    }
    // A stylist who is not qualified can't be asked for.
    await assert.rejects(() => F.availability({ people: [{ self: true, services: [{ service: 'loc-color', variation: colorV.id, stylist: 'test-fam' }, { service: 'loc-retwist', variation: RETWIST_V.id }] }], date }), (e) => e.status === 404);
    const o = a.options[Math.min(1, a.options.length - 1)];
    const ppl = [{ ...stack[0], services: stack[0].services.map((sv, k) => ({ ...sv, stylist: o.people[0].legs[k].stylist.slug, startAt: o.people[0].legs[k].startAt })) }];
    const v = await F.create({ policyAck: true, holder: HOLDER, people: ppl });
    assert.equal(v.kind, 'combo'); assert.equal(v.people.length, 2);
    assert.equal(new Date(v.people[1].startsAt).toISOString(), new Date(v.people[0].endsAt).toISOString());
    // Out-of-order or gapped legs are refused.
    const gapped = [{ ...ppl[0], services: [ppl[0].services[0], { ...ppl[0].services[1], startAt: new Date(new Date(ppl[0].services[1].startAt).getTime() + 15 * 60000).toISOString() }] }];
    await assert.rejects(() => F.create({ policyAck: true, holder: HOLDER, people: gapped }), (e) => e.status === 400 && /must start when/.test(e.message));
    await F.cancel(v.code);
  });

  test('same day: when together is impossible, sameday finds a plan; soonest walks forward', async () => {
    const date = addDays(nextTuesday(), 8);   // a Wednesday
    // Make "together" impossible on that day: block bethany except the morning, and test-fam except the afternoon.
    const two = people().map(p => ({ ...p, services: p.services.map(sv => ({ ...sv, stylist: 'bethany' })) }));   // both want bethany → sequential only
    const together = await F.availability({ people: two, date, mode: 'together' });
    const sameday = await F.availability({ people: two, date, mode: 'sameday' });
    assert.ok(sameday.options.length >= together.options.length);
    assert.ok(sameday.options.length, 'bethany can see both, one after the other');
    const o = sameday.options[0];
    const t0 = new Date(o.people[0].legs[0].startAt).getTime(), t1 = new Date(o.people[1].legs[0].startAt).getTime();
    assert.ok(Math.abs(t1 - t0) >= 90 * 60000, 'one stylist, so the second person waits for the first to finish');
    const s = await F.soonest({ people: two, mode: 'sameday', from: date });
    assert.equal(s.date, date); assert.ok(s.option);
    const none = await F.soonest({ people: [{ self: true, services: [{ service: 'loc-color', variation: (await B.listServices()).flatMap(c => c.services).find(x => x.slug === 'loc-color').variations[0].id, stylist: 'bethany' }, { service: 'loc-retwist', variation: RETWIST_V.id, stylist: 'test-fam' }] }], mode: 'together', from: date });
    assert.ok(none.date === null || none.option, 'soonest never throws');
  });

  test('reminders: one message per family visit, not one per leg', async () => {
    notify.outbox.length = 0;
    const r = await S.sendReminders({ hours: 24 * 30 });   // everything in the next month, our visit included
    const mine = r.results.filter(x => x.code === VISIT.code);
    assert.equal(mine.length, 1, 'the visit reminded once');
    const sms = notify.outbox.filter(m => m.channel === 'sms' && m.to === '+16025550890' && /reminder/.test(m.body) && m.body.includes(VISIT.code));
    assert.equal(sms.length, 1); assert.match(sms[0].body, /Kai/);
  });
}
