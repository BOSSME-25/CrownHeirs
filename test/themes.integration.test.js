// Theme days against a real Postgres: saving rules, the booking gate, the
// prebook window, the day view, moving an appointment, and the handlers.
const test = require('node:test');
const assert = require('node:assert/strict');

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  test('themes integration (skipped: no TEST_DATABASE_URL)', { skip: true }, () => {});
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
  const T = require('../lib/themes');
  const notify = require('../lib/notify');
  const { addDays, todayIn, weekdayOf } = require('../lib/tz');
  const themesApi = require('../api/book/themes');
  const createApi = require('../api/book/create');
  const staffApi = require('../api/book/staff');

  const req = (method, { query = {}, body, headers = {} } = {}) => ({ method, query, body, headers });
  const res = () => ({ statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; } });
  const call = async (h, r) => { const s = res(); await h(r, s); return s; };
  const ADMIN = { 'x-admin-key': 'test-admin-key' };

  // This suite owns stylist 'test-theme' (works every day, all day), phone …0893,
  // and every theme whose name starts with "Test ".
  const PHONE = '16025550893';
  const client = { name: 'Theme Client', phone: '602-555-0893', email: 'theme@example.com' };
  const TODAY = todayIn('America/Phoenix');
  const nextOf = (wd, from = addDays(TODAY, 2)) => { let d = from; while (weekdayOf(d) !== wd) d = addDays(d, 1); return d; };
  let PONY, PONY_V, FRIDAY, TUESDAY;

  test.before(async () => {
    await migrate(); await seed();
    await db.query(`DELETE FROM appointments WHERE client_id IN (SELECT id FROM clients WHERE phone = $1) OR stylist_id IN (SELECT id FROM stylists WHERE slug = 'test-theme')`, [PHONE]);
    await db.query(`DELETE FROM clients WHERE phone = $1`, [PHONE]);
    await db.query(`DELETE FROM stylists WHERE slug = 'test-theme'`);
    await db.query(`DELETE FROM day_themes WHERE name LIKE 'Test %'`);
    await S.saveStylist({ name: 'Test Theme', title: 'Stylist', active: true,
      hours: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMin: 0, endMin: 1440 })), services: ['sleek-ponytail'] });
    const all = (await B.listServices()).flatMap(c => c.services);
    PONY = all.find(s => s.slug === 'sleek-ponytail'); PONY_V = PONY.variations[0];
    FRIDAY = nextOf(5); TUESDAY = nextOf(2);
  });
  test.after(async () => {
    await db.query(`DELETE FROM day_themes WHERE name LIKE 'Test %'`);
    await db.getPool().end();
  });

  const slotOn = async (date) => (await B.availability({ serviceSlug: 'sleek-ponytail', variationId: PONY_V.id, date, stylistSlug: 'test-theme', staff: true })).stylists[0].slots;

  test('save: a weekly family day and a dated prebook day; validation', async () => {
    const fam = await T.save({ name: 'Test Family Friday', audience: 'family', ruleKind: 'weekly', weekday: 5, headline: "It's Family Friday", body: 'Expect children to be present and heard.' });
    assert.ok(fam.id); assert.equal(fam.weekday, 5);
    await assert.rejects(() => T.save({ name: '', ruleKind: 'weekly', weekday: 5 }), (e) => e.status === 400);
    await assert.rejects(() => T.save({ name: 'Test X', ruleKind: 'date' }), (e) => e.status === 400);
    assert.equal((await T.forDate(FRIDAY)).name, 'Test Family Friday');
    assert.equal(await T.forDate(TUESDAY), null);
    const cal = await T.calendar();
    assert.equal(cal.days[FRIDAY].name, 'Test Family Friday');
  });

  test('gate: a solo adult booking on Family Friday needs acknowledgement; with it, the booking records the theme', async () => {
    const slots = await slotOn(FRIDAY);
    const startAt = slots[4];
    const base = { serviceSlug: 'sleek-ponytail', variationId: PONY_V.id, stylistSlug: 'test-theme', startAt, client, staff: false };
    // Lead time: the test stylist works all day, and FRIDAY is at least 2 days out.
    await assert.rejects(() => B.createAppointment(base), (e) => e.status === 409 && e.extra && e.extra.needsAck && e.extra.theme.name === 'Test Family Friday');
    notify.outbox.length = 0;
    const a = await B.createAppointment({ ...base, themeAck: true });
    assert.equal(a.theme.name, 'Test Family Friday'); assert.equal(a.theme.fit, false);
    const sms = notify.outbox.find(m => m.channel === 'sms' && m.to === '+16025550893');
    assert.match(sms.body, /may be moved/);
    const { rows: [row] } = await db.query(`SELECT theme_id, theme_fit, theme_ack FROM appointments WHERE code = $1`, [a.code]);
    assert.equal(row.theme_fit, false); assert.equal(row.theme_ack, true); assert.ok(row.theme_id);
    // The desk sees it flagged, and the day carries the theme.
    const day = await S.day(FRIDAY);
    assert.equal(day.theme.name, 'Test Family Friday');
    const mine = day.appointments.find(x => x.code === a.code);
    assert.equal(mine.theme.fit, false); assert.equal(mine.theme.ack, true);
    // A children's service fits without acknowledgement (through the handler, which carries the flag).
    const h = await call(createApi, req('POST', { body: { service: 'sleek-ponytail', variation: PONY_V.id, stylist: 'test-theme', startAt: slots[20], client } }));
    assert.equal(h.statusCode, 409); assert.equal(h.body.needsAck, true); assert.equal(h.body.theme.audience, 'family');
    const ok = await call(createApi, req('POST', { body: { service: 'sleek-ponytail', variation: PONY_V.id, stylist: 'test-theme', startAt: slots[20], client, themeAck: true } }));
    assert.equal(ok.statusCode, 201); assert.equal(ok.body.theme.fit, false);
    // Staff bookings are never gated.
    const staffBooked = await B.createAppointment({ ...base, startAt: slots[40], staff: true });
    assert.equal(staffBooked.theme.fit, false);
    // A plain Tuesday has no theme.
    const t = await B.createAppointment({ ...base, startAt: (await slotOn(TUESDAY))[4], staff: true });
    assert.equal(t.theme, null);
  });

  test('move: an outside-audience booking is rescheduled; the client is told; the old slot frees up', async () => {
    const day = await S.day(FRIDAY);
    const a = day.appointments.find(x => x.theme && x.theme.fit === false && x.status === 'confirmed');
    const slots = await slotOn(TUESDAY);
    const target = slots[30];
    notify.outbox.length = 0;
    const moved = await S.move(a.code, { startAt: target, reason: 'to make room on Family Friday' });
    assert.equal(new Date(moved.startsAt).toISOString(), target);
    assert.ok(moved.movedFrom);
    const sms = notify.outbox.find(m => m.channel === 'sms' && m.to === '+16025550893');
    assert.match(sms.body, /moved/);
    assert.ok((await slotOn(FRIDAY)).includes(new Date(a.startsAt).toISOString()), 'old slot is open again');
    const back = await S.day(TUESDAY);
    assert.ok(back.appointments.some(x => x.code === a.code && x.movedFrom), 'it shows on its new day, marked as moved');
    await assert.rejects(() => S.move('CH-NOPE1', { startAt: target }), (e) => e.status === 404);
  });

  test('prebook: a dated theme opens its date beyond the usual window; other far dates stay closed', async () => {
    const far = addDays(TODAY, 90);                        // beyond max_days_ahead (60)
    await assert.rejects(() => B.availability({ serviceSlug: 'sleek-ponytail', variationId: PONY_V.id, date: far }), (e) => e.status === 400);
    await T.save({ name: "Test Mother's Day", audience: 'everyone', ruleKind: 'date', onDate: far, prebookDays: 120, headline: 'Treat her' });
    const av = await B.availability({ serviceSlug: 'sleek-ponytail', variationId: PONY_V.id, date: far, stylistSlug: 'test-theme' });
    assert.ok(av.stylists[0].slots.length > 0, 'the prebook date is bookable');
    await assert.rejects(() => B.availability({ serviceSlug: 'sleek-ponytail', variationId: PONY_V.id, date: addDays(far, 1) }), (e) => e.status === 400, 'the day after is not');
    const cal = await T.calendar();
    assert.ok(cal.prebook.some(p => p.date === far), 'the calendar lists it as a prebook day');
    const g = await call(themesApi, req('GET'));
    assert.equal(g.statusCode, 200); assert.ok(g.body.days[far]);
    const one = await call(themesApi, req('GET', { query: { date: far } }));
    assert.equal(one.body.theme.headline, 'Treat her');
  });

  test('handlers: themes.list / theme.save / theme.remove need the admin key', async () => {
    assert.equal((await call(staffApi, req('GET', { query: { action: 'themes.list' } }))).statusCode, 401);
    const l = await call(staffApi, req('GET', { headers: ADMIN, query: { action: 'themes.list' } }));
    assert.ok(l.body.themes.some(t => t.name === 'Test Family Friday'));
    const sv = await call(staffApi, req('POST', { headers: ADMIN, body: { action: 'theme.save', name: 'Test Zin Saturday', audience: 'adults', ruleKind: 'weekly', weekday: 6 } }));
    assert.equal(sv.statusCode, 200);
    const rm = await call(staffApi, req('POST', { headers: ADMIN, body: { action: 'theme.remove', id: sv.body.id } }));
    assert.equal(rm.statusCode, 200);
  });
}
