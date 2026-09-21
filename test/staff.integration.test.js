// Front-desk operations and reminders against a real Postgres.
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5433/crownheirs node --test
const test = require('node:test');
const assert = require('node:assert/strict');

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  test('staff integration (skipped: no TEST_DATABASE_URL)', { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = url;
  process.env.NOTIFY_DRY_RUN = '1';
  process.env.NOTIFY_EMAIL = 'desk@example.com';
  process.env.ADMIN_PASSWORD = 'test-admin-key';
  process.env.CRON_SECRET = 'cron-secret';
  const db = require('../lib/db');
  const { migrate, seed } = require('../lib/setup');
  const B = require('../lib/booking');
  const S = require('../lib/staff');
  const notify = require('../lib/notify');
  const { todayIn, addDays } = require('../lib/tz');
  // "Today" is unreliable in a test: near midnight Phoenix there are no slots
  // left. Tomorrow always has a full day, and the test stylist works 24/7.
  const TOMORROW = addDays(todayIn('America/Phoenix'), 1);
  const handler = require('../api/book/staff');
  const reminders = require('../api/book/reminders');

  const req = (method, { query = {}, body, headers = {} } = {}) => ({ method, query, body, headers });
  const res = () => ({ statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; } });
  const call = async (h, r) => { const s = res(); await h(r, s); return s; };
  const ADMIN = { 'x-admin-key': 'test-admin-key' };
  const PHONE = '602-555-0777';
  let PONY, PONY_V;

  test.before(async () => {
    await migrate(); await seed();
    // Appointments never cascade from a stylist (history must survive a
    // roster change), so a leftover test stylist's bookings go first.
    await db.query(`DELETE FROM appointments WHERE stylist_id IN (SELECT id FROM stylists WHERE slug LIKE 'test-%')
                        OR client_id IN (SELECT id FROM clients WHERE phone = '16025550777')`);
    await db.query(`DELETE FROM clients WHERE phone = '16025550777'`);
    await db.query(`DELETE FROM stylists WHERE slug LIKE 'test-%'`);
    const all = (await B.listServices()).flatMap(c => c.services);
    PONY = all.find(s => s.slug === 'sleek-ponytail'); PONY_V = PONY.variations[0];
  });
  test.after(async () => { await db.getPool().end(); });

  test('team: add a stylist with round-the-clock hours and two services; they appear in availability', async () => {
    const { slug } = await S.saveStylist({
      name: 'Test Stylist', title: 'Loctician', active: true,
      hours: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMin: 0, endMin: 1440 })),
      services: ['sleek-ponytail', 'loc-retwist']
    });
    assert.equal(slug, 'test-stylist');
    const roster = await S.listStylists();
    const me = roster.find(s => s.slug === slug);
    assert.equal(me.hours.length, 7);
    assert.deepEqual(me.services.sort(), ['loc-retwist', 'sleek-ponytail']);
    const a = await B.availability({ serviceSlug: 'sleek-ponytail', variationId: PONY_V.id, date: TOMORROW, stylistSlug: slug, staff: true });
    assert.ok(a.stylists[0].slots.length > 0, 'staff availability today with no lead time');
    await assert.rejects(() => S.saveStylist({ name: 'X', hours: [{ weekday: 1, startMin: 600, endMin: 500 }] }), (e) => e.status === 400);
  });

  test('phone booking today → on the day view → status changes → cancel notifies', async () => {
    notify.outbox.length = 0;
    const date = TOMORROW;
    const av = await call(handler, req('GET', { headers: ADMIN, query: { action: 'availability', service: 'sleek-ponytail', variation: String(PONY_V.id), date, stylist: 'test-stylist' } }));
    assert.equal(av.statusCode, 200, JSON.stringify(av.body));
    const startAt = av.body.stylists[0].slots[0];

    const b = await call(handler, req('POST', { headers: ADMIN, body: { action: 'book', service: 'sleek-ponytail', variation: PONY_V.id, stylist: 'test-stylist', startAt, client: { name: 'Desk Client', phone: PHONE }, notes: 'called in' } }));
    assert.equal(b.statusCode, 201, JSON.stringify(b.body));
    assert.equal(b.body.source, 'staff');
    assert.ok(notify.outbox.some(m => m.channel === 'sms' && m.to === '+16025550777' && /you're booked/.test(m.body)), 'client SMS');
    assert.ok(notify.outbox.some(m => m.channel === 'email' && m.to === 'desk@example.com' && /New booking/.test(m.text)), 'salon email');

    const d = await call(handler, req('GET', { headers: ADMIN, query: { action: 'day', date } }));
    const mine = d.body.appointments.find(a => a.code === b.body.code);
    assert.ok(mine, 'appears on the day'); assert.equal(mine.client.phone, '16025550777'); assert.equal(mine.source, 'staff');

    const done = await call(handler, req('POST', { headers: ADMIN, body: { action: 'status', code: b.body.code, status: 'completed' } }));
    assert.equal(done.body.status, 'completed');
    assert.equal((await call(handler, req('POST', { headers: ADMIN, body: { action: 'status', code: b.body.code, status: 'bogus' } }))).statusCode, 400);

    notify.outbox.length = 0;
    const x = await call(handler, req('POST', { headers: ADMIN, body: { action: 'status', code: b.body.code, status: 'cancelled' } }));
    assert.equal(x.body.status, 'cancelled');
    assert.ok(notify.outbox.some(m => m.channel === 'sms' && /cancelled/.test(m.body)), 'client told about cancellation');
    assert.equal((await call(handler, req('GET', { query: { action: 'day', date } }))).statusCode, 401, 'no key → 401');
  });

  test('time off removes slots and reports bookings it collides with', async () => {
    const date = TOMORROW;
    const before = (await B.availability({ serviceSlug: 'sleek-ponytail', variationId: PONY_V.id, date, stylistSlug: 'test-stylist', staff: true })).stylists[0].slots;
    const startAt = before[Math.floor(before.length / 2)];
    const appt = await B.createAppointment({ serviceSlug: 'sleek-ponytail', variationId: PONY_V.id, stylistSlug: 'test-stylist', startAt, client: { name: 'Desk Client', phone: PHONE }, staff: true });
    const block = await S.addTimeOff({ stylist: 'test-stylist', startsAt: startAt, endsAt: new Date(new Date(startAt).getTime() + 3 * 3600000).toISOString(), reason: 'lunch' });
    assert.equal(block.conflicts.length, 1); assert.equal(block.conflicts[0].code, appt.code);
    const after = (await B.availability({ serviceSlug: 'sleek-ponytail', variationId: PONY_V.id, date, stylistSlug: 'test-stylist', staff: true })).stylists[0].slots;
    assert.ok(after.length < before.length - 5, 'blocked window is gone');
    const day = await S.day(date);
    assert.ok(day.timeOff.some(t => t.id === block.id && t.reason === 'lunch'));
    await S.removeTimeOff(block.id);
    await assert.rejects(() => S.removeTimeOff(block.id), (e) => e.status === 404);
    await S.setStatus(appt.code, 'cancelled');
  });

  test('reminders: cron auth, sends once per upcoming appointment, marks it', async () => {
    const date = TOMORROW;
    const slots = (await B.availability({ serviceSlug: 'sleek-ponytail', variationId: PONY_V.id, date, stylistSlug: 'test-stylist', staff: true })).stylists[0].slots;
    // First slot of tomorrow is always inside the 36-hour reminder window.
    const appt = await B.createAppointment({ serviceSlug: 'sleek-ponytail', variationId: PONY_V.id, stylistSlug: 'test-stylist', startAt: slots[0], client: { name: 'Desk Client', phone: PHONE, email: 'c@example.com' }, staff: true });

    assert.equal((await call(reminders, req('GET'))).statusCode, 401);
    notify.outbox.length = 0;
    const r1 = await call(reminders, req('GET', { headers: { authorization: 'Bearer cron-secret' }, query: {} }));
    assert.equal(r1.statusCode, 200, JSON.stringify(r1.body));
    assert.ok(r1.body.results.some(x => x.code === appt.code), 'our appointment was reminded');
    assert.ok(notify.outbox.some(m => m.channel === 'sms' && m.to === '+16025550777' && /reminder/.test(m.body)));
    assert.ok(!notify.outbox.some(m => m.to === 'desk@example.com'), 'reminders do not copy the salon');
    const r2 = await call(reminders, req('GET', { headers: ADMIN, query: {} }));
    assert.ok(!r2.body.results.some(x => x.code === appt.code), 'never reminded twice');
    await S.setStatus(appt.code, 'cancelled');
  });

  test('Team Hub: hub shifts drive availability; bookings and status changes are pushed and recorded; outage falls back', async () => {
    const hub = require('../lib/teamhub');
    process.env.TEAMHUB_URL = 'https://team.example.com'; process.env.TEAMHUB_SECRET = 'hub-secret';
    const pushes = [];
    const ok = (body) => ({ ok: true, status: 200, json: async () => body });
    hub._setFetch(async (url, opts) => {
      if (/\/api\/webhooks\/highlevel$/.test(url)) { pushes.push(JSON.parse(opts.body)); return ok({ ok: true, stylistMatched: true }); }
      if (/\/api\/integrations\/schedule/.test(url)) return ok({ timezone: 'America/Phoenix', entries: [
        { email: 'test@crownheirs.com', name: 'Test Stylist', date: TOMORROW, start: '10:00', end: '14:00', type: 'shift' } ] });
      throw new Error('unexpected ' + url);
    });
    const allDay = Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMin: 0, endMin: 1440 }));
    const local = iso => new Date(iso).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'America/Phoenix' });
    try {
      await S.saveStylist({ slug: 'test-stylist', name: 'Test Stylist', title: 'Loctician', active: true, email: 'Test@CrownHeirs.com', hoursSource: 'hub', hours: allDay, services: ['sleek-ponytail', 'loc-retwist'] });
      await assert.rejects(() => S.saveStylist({ slug: 'test-stylist', name: 'Test Stylist', hoursSource: 'hub', email: '' }), (e) => e.status === 400, 'hub hours need an email');
      assert.equal((await S.listStylists()).find(s => s.slug === 'test-stylist').email, 'test@crownheirs.com');

      hub._clearCache();
      const av = await B.availability({ serviceSlug: 'sleek-ponytail', variationId: PONY_V.id, date: TOMORROW, stylistSlug: 'test-stylist', staff: true });
      const times = av.stylists[0].slots.map(local);
      assert.equal(times[0], '10:00', 'first slot is the hub shift start');
      assert.ok(times.every(t => t >= '10:00' && t < '14:00'), 'nothing outside the hub shift: ' + times.join(','));

      const appt = await B.createAppointment({ serviceSlug: 'sleek-ponytail', variationId: PONY_V.id, stylistSlug: 'test-stylist', startAt: av.stylists[0].slots[0], client: { name: 'Desk Client', phone: PHONE }, staff: true });
      assert.equal(appt.hub.sent, true);
      const p = pushes.find(x => x.id === appt.code);
      assert.ok(p, 'booking pushed'); assert.equal(p.calendarId, 'test-stylist'); assert.equal(p.userId, 'test@crownheirs.com'); assert.equal(p.status, 'booked');
      const { rows: [row] } = await db.query('SELECT hub_synced_at, hub_error FROM appointments WHERE code = $1', [appt.code]);
      assert.ok(row.hub_synced_at, 'sync recorded'); assert.equal(row.hub_error, null);

      await S.setStatus(appt.code, 'no_show');
      assert.equal(pushes.filter(x => x.id === appt.code).pop().status, 'no_show');
      assert.ok((await S.day(TOMORROW)).appointments.find(a => a.code === appt.code).hub.syncedAt);
      const r = await S.hubResync({ from: TOMORROW, to: TOMORROW });
      assert.ok(r.total >= 1 && r.sent === r.total && r.failed === 0, JSON.stringify(r));
      await S.setStatus(appt.code, 'cancelled');

      // Hub down → local hours stand in, and nothing throws.
      hub._setFetch(async () => { throw new Error('down'); }); hub._clearCache();
      const fb = await B.availability({ serviceSlug: 'sleek-ponytail', variationId: PONY_V.id, date: TOMORROW, stylistSlug: 'test-stylist', staff: true });
      assert.ok(fb.stylists[0].slots.length > times.length, 'local 24h hours used while the hub is unreachable');
    } finally {
      hub._setFetch((...a) => fetch(...a)); hub._clearCache();
      delete process.env.TEAMHUB_URL; delete process.env.TEAMHUB_SECRET;
      await S.saveStylist({ slug: 'test-stylist', name: 'Test Stylist', hoursSource: 'local', email: '', hours: allDay, services: ['sleek-ponytail', 'loc-retwist'] });
    }
  });
}
