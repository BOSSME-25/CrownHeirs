// Deposits and policies against a real Postgres: the acceptance gate, the
// deposit on a booking, Square payment links (stubbed), the desk marking a
// deposit paid, late cancellation forfeiting it (unless waived), no-shows,
// the ticket credit, and the settings handler.
const test = require('node:test');
const assert = require('node:assert/strict');

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  test('deposits integration (skipped: no TEST_DATABASE_URL)', { skip: true }, () => {});
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
  const T = require('../lib/tickets');
  const F = require('../lib/family');
  const square = require('../lib/square');
  const notify = require('../lib/notify');
  const { addDays, todayIn, weekdayOf } = require('../lib/tz');
  const staffApi = require('../api/book/staff');
  const policyApi = require('../api/book/policy');
  const lookupApi = require('../api/book/lookup');

  const req = (method, { query = {}, body, headers = {} } = {}) => ({ method, query, body, headers });
  const res = () => ({ statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; } });
  const call = async (h, r) => { const s = res(); await h(r, s); return s; };
  const ADMIN = { 'x-admin-key': 'test-admin-key' };

  // This suite owns stylist 'test-dep' (all day, every day), phone …0897.
  const PHONE = '16025550897';
  const client = { name: 'Deposit Client', phone: '602-555-0897', email: 'dep@example.com' };
  const nextOf = (wd) => { let d = addDays(todayIn('America/Phoenix'), 3); while (weekdayOf(d) !== wd) d = addDays(d, 1); return d; };
  let PONY, PONY_V, MONDAY;

  test.before(async () => {
    await migrate(); await seed();
    await db.query(`DELETE FROM ticket_refunds WHERE ticket_id IN (SELECT id FROM tickets WHERE client_id IN (SELECT id FROM clients WHERE phone = $1))`, [PHONE]);
    await db.query(`DELETE FROM tickets WHERE client_id IN (SELECT id FROM clients WHERE phone = $1) OR appointment_id IN (SELECT id FROM appointments WHERE stylist_id IN (SELECT id FROM stylists WHERE slug = 'test-dep'))`, [PHONE]);
    const hh = `SELECT household_id FROM clients WHERE phone = '${PHONE}' AND household_id IS NOT NULL`;
    await db.query(`DELETE FROM appointments WHERE client_id IN (SELECT id FROM clients WHERE phone = $1 OR household_id IN (${hh})) OR stylist_id IN (SELECT id FROM stylists WHERE slug = 'test-dep')
                      OR visit_id IN (SELECT id FROM visits WHERE holder_id IN (SELECT id FROM clients WHERE phone = $1))`, [PHONE]);
    await db.query(`DELETE FROM clients WHERE phone IS NULL AND household_id IN (${hh})`);
    await db.query(`DELETE FROM clients WHERE phone = $1`, [PHONE]);
    await db.query(`DELETE FROM stylists WHERE slug = 'test-dep'`);
    await db.query(`INSERT INTO settings (key, value) VALUES ('deposit_percent','25'),('deposit_min_cents','2500'),('cancel_window_hours','24'),('late_grace_min','15') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    await S.saveStylist({ name: 'Test Dep', title: 'Stylist', active: true,
      hours: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMin: 0, endMin: 1440 })), services: ['sleek-ponytail', 'loc-retwist'] });
    const all = (await B.listServices()).flatMap(c => c.services);
    PONY = all.find(s => s.slug === 'sleek-ponytail'); PONY_V = PONY.variations[0];
    MONDAY = nextOf(1);
  });
  test.after(async () => { square._setFetch((...a) => fetch(...a)); await db.getPool().end(); });

  const slots = async (date) => (await B.availability({ serviceSlug: 'sleek-ponytail', variationId: PONY_V.id, date, stylistSlug: 'test-dep', staff: true })).stylists[0].slots;
  const base = (startAt) => ({ serviceSlug: 'sleek-ponytail', variationId: PONY_V.id, stylistSlug: 'test-dep', startAt, client });

  test('policy endpoint and the acceptance gate: online needs the box; the desk does not', async () => {
    const p = await call(policyApi, req('GET', { query: { services: 'sleek-ponytail,consultations' } }));
    assert.equal(p.statusCode, 200);
    assert.equal(p.body.deposit_cents, Math.max(Math.round(PONY.price_from_cents * 0.25 / 100) * 100, 2500), 'consultations add nothing; whole dollars');
    assert.match(p.body.terms, /24 hours/);
    const [t0] = await slots(MONDAY);
    await assert.rejects(() => B.createAppointment(base(t0)), (e) => e.status === 400 && e.extra && e.extra.needsPolicyAck && e.extra.deposit_cents > 0);
    const desk = await B.createAppointment({ ...base(t0), staff: true });
    assert.equal(desk.deposit.status, 'due'); assert.ok(desk.deposit.cents > 0);
    await S.setStatus(desk.code, 'cancelled');
  });

  let APPT;
  test('booking with acceptance: the deposit is recorded, the confirmation says so, Square (stubbed) gives a pay link that lookup later finds paid', async () => {
    process.env.SQUARE_ACCESS_TOKEN = 'test-token'; process.env.SQUARE_LOCATION_ID = 'LOC1'; process.env.SQUARE_ENV = 'sandbox';
    let paid = false; const calls = [];
    square._setFetch(async (url, opts) => {
      calls.push({ url, opts });
      if (/payment-links$/.test(url)) {
        const body = JSON.parse(opts.body);
        assert.equal(body.quick_pay.location_id, 'LOC1'); assert.ok(body.quick_pay.price_money.amount > 0); assert.match(body.checkout_options.redirect_url, /\/book\?code=CH-/);
        return { ok: true, status: 200, json: async () => ({ payment_link: { id: 'PL1', url: 'https://square.link/u/test', order_id: 'ORDER1' } }) };
      }
      if (/\/v2\/orders\/ORDER1$/.test(url)) return { ok: true, status: 200, json: async () => ({ order: { state: paid ? 'COMPLETED' : 'OPEN', tenders: paid ? [{ amount_money: { amount: 1 } }] : [] } }) };
      return { ok: false, status: 404, json: async () => ({ errors: [{ code: 'NOT_FOUND' }] }) };
    });
    const [, t1] = await slots(MONDAY);
    notify.outbox.length = 0;
    APPT = await B.createAppointment({ ...base(t1), policyAck: true });
    assert.equal(APPT.deposit.status, 'due'); assert.equal(APPT.deposit.payUrl, 'https://square.link/u/test');
    assert.match(notify.outbox.find(m => m.channel === 'sms' && m.to === '+16025550897').body, /Deposit due: \$\d+ — pay here: https:\/\/square\.link/);
    assert.match(notify.outbox.find(m => m.channel === 'email' && m.to === 'dep@example.com').text, /24 hours/);
    let l = await B.lookup(APPT.code);
    assert.equal(l.deposit.status, 'due'); assert.equal(l.deposit.payUrl, 'https://square.link/u/test');
    paid = true;
    l = await B.lookup(APPT.code);
    assert.equal(l.deposit.status, 'paid', 'Square says the order is paid → marked paid');
    assert.equal(l.deposit.payUrl, null);
    const h = await call(lookupApi, req('GET', { query: { code: APPT.code } }));
    assert.equal(h.body.deposit.status, 'paid');
    delete process.env.SQUARE_ACCESS_TOKEN; delete process.env.SQUARE_LOCATION_ID;
  });

  test('ticket: the paid deposit comes off the amount due today', async () => {
    const t = await T.open({ appointmentCode: APPT.code, rungBy: 'bethany' });
    assert.equal(t.deposit_cents, APPT.deposit.cents);
    assert.equal(t.due_cents, Math.max(0, t.total_cents - APPT.deposit.cents));
    await T.voidTicket(t.code, 'test');
  });

  test('late cancellation forfeits a paid deposit; a member keeps it; on time keeps it', async () => {
    // APPT is a few days out → on time: deposit stays.
    const ok = await B.cancel(APPT.code);
    assert.equal(ok.lateCancel, false); assert.equal(ok.deposit.status, 'paid'); assert.equal(ok.deposit.forfeited, false);
    // A booking 2 hours out (desk, no lead), deposit marked paid by hand, cancelled online → forfeited.
    const soonAt = new Date(Date.now() + 2 * 3600 * 1000); soonAt.setMinutes(Math.ceil(soonAt.getMinutes() / 15) * 15, 0, 0);
    const soon = await B.createAppointment({ ...base(soonAt.toISOString()), staff: true });
    const marked = await S.markDeposit(soon.code, { status: 'paid', ref: 'Square terminal' });
    assert.equal(marked.deposit.status, 'paid'); assert.equal(marked.deposit.ref, 'Square terminal');
    const look = await B.lookup(soon.code);
    assert.equal(look.cancelLate, true); assert.equal(look.cancelForfeits, true);
    notify.outbox.length = 0;
    const x = await B.cancel(soon.code);
    assert.equal(x.lateCancel, true); assert.equal(x.deposit.forfeited, true);
    assert.match(notify.outbox.find(m => m.channel === 'sms' && m.to === '+16025550897').body, /forfeited/);
    // Same again for a member: fees waived → deposit kept.
    await S.waiveFees(client.phone, true);
    const soonAt2 = new Date(soonAt.getTime() + 3 * 3600 * 1000);
    const soon2 = await B.createAppointment({ ...base(soonAt2.toISOString()), staff: true });
    await S.markDeposit(soon2.code, { status: 'paid', ref: 'cash' });
    assert.equal((await B.lookup(soon2.code)).cancelForfeits, false);
    const y = await B.cancel(soon2.code);
    assert.equal(y.lateCancel, true); assert.equal(y.deposit.forfeited, false); assert.equal(y.deposit.status, 'paid');
    await S.waiveFees(client.phone, false);
  });

  test('no-show forfeits; the day view flags late arrivals and shows deposits', async () => {
    const [t] = (await slots(MONDAY)).slice(5);
    const a = await B.createAppointment({ ...base(t), staff: true });
    await S.markDeposit(a.code, { status: 'paid', ref: 'cash' });
    const ns = await S.setStatus(a.code, 'no_show');
    assert.equal(ns.deposit.status, 'forfeited');
    // A confirmed booking 30 minutes in the past is late (grace 15).
    const pastAt = new Date(Date.now() - 30 * 60000); pastAt.setSeconds(0, 0);
    const { rows: [sv] } = await db.query(`SELECT id FROM services WHERE slug = 'sleek-ponytail'`);
    const { rows: [st] } = await db.query(`SELECT id FROM stylists WHERE slug = 'test-dep'`);
    const { rows: [cl] } = await db.query(`SELECT id FROM clients WHERE phone = $1`, [PHONE]);
    await db.query(`INSERT INTO appointments (code, stylist_id, service_id, client_id, starts_at, ends_at, busy_until, deposit_cents, deposit_status, policy_ack)
                    VALUES ('CH-LATE1', $1, $2, $3, $4::timestamptz, $4::timestamptz + interval '60 minutes', $4::timestamptz + interval '75 minutes', 2500, 'due', true)
                    ON CONFLICT (code) DO UPDATE SET starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at, busy_until = EXCLUDED.busy_until, status = 'confirmed'`, [st.id, sv.id, cl.id, pastAt]);
    const day = await S.day(todayIn('America/Phoenix'));
    const mine = day.appointments.find(x => x.code === 'CH-LATE1');
    assert.equal(mine.late, true); assert.equal(mine.deposit.status, 'due'); assert.equal(day.policy.graceMin, 15);
    await db.query(`DELETE FROM appointments WHERE code = 'CH-LATE1'`);
  });

  test('family visit: one deposit for the lot, one pay link, acceptance required', async () => {
    const date = addDays(MONDAY, 1);
    const ppl = [
      { self: true, name: client.name, services: [{ service: 'sleek-ponytail', variation: PONY_V.id, stylist: 'test-dep' }] },
      // Both on this suite's own stylist (sameday seats them one after the other), so no other suite's bookings can clash.
      { name: 'Kai', services: [{ service: 'loc-retwist', variation: (await B.listServices()).flatMap(c => c.services).find(s => s.slug === 'loc-retwist').variations[0].id, stylist: 'test-dep' }] }
    ];
    const av = await F.availability({ people: ppl, date, mode: 'sameday' });
    assert.ok(av.options.length);
    const o = av.options[0];
    const booked = ppl.map((p, i) => ({ ...p, services: p.services.map((sv, k) => ({ ...sv, stylist: o.people[i].legs[k].stylist.slug, startAt: o.people[i].legs[k].startAt })) }));
    await assert.rejects(() => F.create({ holder: client, people: booked, mode: 'sameday' }), (e) => e.status === 400 && e.extra.needsPolicyAck);
    const v = await F.create({ holder: client, people: booked, mode: 'sameday', policyAck: true });
    assert.ok(v.deposit.cents > 0); assert.equal(v.deposit.status, 'due');
    const l = await F.lookup(v.code);
    assert.equal(l.deposit.due, v.deposit.cents); assert.equal(l.people.length, 2);
    await F.cancel(v.code);
  });

  test('settings handler: policy values save with validation', async () => {
    const bad = await call(staffApi, req('POST', { headers: ADMIN, body: { action: 'settings.save', deposit_percent: 150 } }));
    assert.equal(bad.statusCode, 400);
    const ok = await call(staffApi, req('POST', { headers: ADMIN, body: { action: 'settings.save', deposit_percent: 30, deposit_min_dollars: 20, cancel_window_hours: 48, late_grace_min: 10, policy_text: 'Be kind.' } }));
    assert.equal(ok.statusCode, 200); assert.equal(ok.body.deposit_min_cents, 2000);
    const g = await call(staffApi, req('GET', { headers: ADMIN, query: { action: 'policy' } }));
    assert.equal(g.body.cancel_window_hours, 48); assert.equal(g.body.policy_text, 'Be kind.');
    // back to the suite's defaults so other suites see the same rules
    await call(staffApi, req('POST', { headers: ADMIN, body: { action: 'settings.save', deposit_percent: 25, deposit_min_dollars: 25, cancel_window_hours: 24, late_grace_min: 15, policy_text: '' } }));
  });
}
