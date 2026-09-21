// Tickets, refunds, retail, API tokens and the /api/v1 read API against Postgres.
const test = require('node:test');
const assert = require('node:assert/strict');

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  test('tickets integration (skipped: no TEST_DATABASE_URL)', { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = url;
  process.env.BOOKING_MODE = 'site';
  process.env.NOTIFY_DRY_RUN = '1';
  process.env.ADMIN_PASSWORD = 'test-admin-key';
  const db = require('../lib/db');
  const { migrate, seed } = require('../lib/setup');
  const B = require('../lib/booking');
  const S = require('../lib/staff');
  const T = require('../lib/tickets');
  const tokens = require('../lib/api-tokens');
  const v1 = require('../api/v1/[resource]');
  const staffApi = require('../api/book/staff');
  const { addDays, todayIn, weekdayOf } = require('../lib/tz');

  const req = (method, { query = {}, body, headers = {} } = {}) => ({ method, query, body, headers });
  const res = () => ({ statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; } });
  const call = async (h, r) => { const s = res(); await h(r, s); return s; };
  const ADMIN = { 'x-admin-key': 'test-admin-key' };
  const PHONE = '602-555-0888';
  let TOMORROW, PONY, PONY_V, RETWIST, RETWIST_V;

  test.before(async () => {
    await migrate(); await seed();
    TOMORROW = addDays(todayIn('America/Phoenix'), 3); while (weekdayOf(TOMORROW) !== 2) TOMORROW = addDays(TOMORROW, 1);
    // Everything this suite creates, in dependency order: refunds → tickets →
    // appointments → clients → its own stylist ('test-till').
    // …including appointments other suites' "first available" bookings landed on our stylist.
    const till = `SELECT id FROM stylists WHERE slug = 'test-till'`;
    const appts = `SELECT id FROM appointments WHERE stylist_id IN (${till}) OR client_id IN (SELECT id FROM clients WHERE phone IN ('16025550888','16025550889'))`;
    const tix = `SELECT id FROM tickets WHERE client_id IN (SELECT id FROM clients WHERE phone IN ('16025550888','16025550889'))
                     OR client_id IS NULL OR rung_by IN (${till}) OR appointment_id IN (${appts})
                     OR client_id IN (SELECT id FROM clients WHERE name = 'Handler Client')`;
    await db.query(`DELETE FROM ticket_refunds WHERE ticket_id IN (${tix})`);
    await db.query(`DELETE FROM tickets WHERE id IN (${tix})`);
    await db.query(`DELETE FROM appointments WHERE id IN (${appts})`);
    await db.query(`DELETE FROM clients WHERE phone IN ('16025550888','16025550889')`);
    await db.query(`DELETE FROM api_tokens WHERE name LIKE 'test-%'`);
    await db.query(`DELETE FROM retail_items WHERE sku = 'TEST-OIL'`);
    await db.query(`DELETE FROM stylists WHERE slug = 'test-till'`);
    await db.query(`INSERT INTO settings (key, value) VALUES ('tax_rate_bps', '860') ON CONFLICT (key) DO UPDATE SET value = '860'`);
    const all = (await B.listServices()).flatMap(c => c.services);
    PONY = all.find(s => s.slug === 'sleek-ponytail'); PONY_V = PONY.variations[0];
    RETWIST = all.find(s => s.slug === 'loc-retwist'); RETWIST_V = RETWIST.variations.find(v => v.name === 'New Client');
    // A second stylist of this suite's own, to prove the provider is per line.
    const { slug } = await S.saveStylist({ name: 'Test Till', hoursSource: 'local', email: '',
      hours: Array.from({ length: 7 }, (_, weekday) => ({ weekday, startMin: 0, endMin: 1440 })), services: ['sleek-ponytail', 'loc-retwist'] });
    assert.equal(slug, 'test-till');
  });
  test.after(async () => { await db.getPool().end(); });

  test('appointment → ticket: prefilled line carries the booked stylist; pay completes the appointment; the hub reads it', async () => {
    const av = await B.availability({ serviceSlug: 'sleek-ponytail', variationId: PONY_V.id, date: TOMORROW, stylistSlug: 'bethany' });
    const appt = await B.createAppointment({ serviceSlug: 'sleek-ponytail', variationId: PONY_V.id, stylistSlug: 'bethany', startAt: av.stylists[0].slots[2], client: { name: 'Till Client', phone: PHONE } });

    const t = await T.open({ appointmentCode: appt.code, rungBy: 'test-till' });
    assert.match(t.code, /^T-[A-Z2-9]{5}$/);
    assert.equal(t.status, 'open'); assert.equal(t.client.name, 'Till Client');
    assert.equal(t.lines.length, 1); assert.equal(t.lines[0].provider.slug, 'bethany', 'provider is the booked stylist, not the till operator');
    assert.equal(t.rungBy.slug, 'test-till'); assert.equal(t.lines[0].gross_cents, PONY.price_from_cents);
    await assert.rejects(() => T.open({ appointmentCode: appt.code }), (e) => e.status === 409, 'one live ticket per appointment');

    // retail line delivered by the other stylist, taxed at 8.6%
    await T.saveRetail({ sku: 'TEST-OIL', name: 'Crown Oil 4oz', price_cents: 2000, taxable: true });
    const oil = (await T.listRetail()).find(r => r.sku === 'TEST-OIL');
    let t2 = await T.addLine(t.code, { kind: 'retail', retailItemId: oil.id, provider: 'test-till', quantity: 2 });
    const retail = t2.lines.find(l => l.kind === 'retail');
    assert.equal(retail.gross_cents, 2000); assert.equal(retail.quantity, 2); assert.equal(retail.tax_cents, 344); assert.equal(retail.provider.slug, 'test-till');
    assert.equal(t2.subtotal_cents, PONY.price_from_cents + 4000); assert.equal(t2.tax_cents, 344);

    // discount with reason on the service line; unpriced custom line blocks payment
    t2 = await T.updateLine(t.code, t2.lines[0].id, { discount_cents: '10', discount_reason: 'first visit' });
    assert.equal(t2.lines[0].discount_cents, 1000); assert.equal(t2.discount_cents, 1000);
    t2 = await T.addLine(t.code, { kind: 'service', name: 'Custom add-on', provider: 'bethany' });
    assert.equal(t2.lines[2].gross_cents, null, 'stays unpriced, not zero');
    await assert.rejects(() => T.pay(t.code, { tender: 'cash' }), (e) => e.status === 400 && /no price/.test(e.message));
    t2 = await T.updateLine(t.code, t2.lines[2].id, { gross_cents: 15 });
    await assert.rejects(() => T.pay(t.code, { tender: 'venmo' }), (e) => e.status === 400);

    const paid = await T.pay(t.code, { tender: 'card', tipCents: '12.00', tenderRef: 'sq_pay_123' });
    assert.equal(paid.status, 'paid'); assert.equal(paid.tip_cents, 1200); assert.equal(paid.tender, 'card'); assert.equal(paid.tenderRef, 'sq_pay_123');
    assert.equal(paid.total_cents, paid.subtotal_cents - paid.discount_cents + paid.tax_cents);
    assert.equal((await B.lookup(appt.code)).status, 'completed', 'a paid ticket completes its appointment');
    await assert.rejects(() => T.addLine(t.code, { kind: 'service', name: 'x', provider: 'bethany', gross_cents: 1 }), (e) => e.status === 409, 'paid tickets are closed');

    // partial refund, then the remainder
    const r1 = await T.refund(t.code, { amountCents: '5.00', reason: 'goodwill' });
    assert.equal(r1.status, 'partially_refunded'); assert.equal(r1.refunded_cents, 500);
    await assert.rejects(() => T.refund(t.code, { amountCents: 999999 }), (e) => e.status === 400 && /exceed/.test(e.message));
    const r2 = await T.refund(t.code, { amountCents: paid.total_cents + paid.tip_cents - 500 });
    assert.equal(r2.status, 'refunded');
    await assert.rejects(() => T.voidTicket(t.code), (e) => e.status === 409);

    // the day's tickets, and the ticket via the appointment on the front desk feed
    const day = await T.listDay(todayIn('America/Phoenix'));
    assert.ok(day.some(x => x.code === t.code));
  });

  test('walk-in ticket with no appointment; void restores nothing but closes the ticket', async () => {
    const t = await T.open({ client: { name: 'Walk In', phone: '602-555-0889' }, rungBy: 'bethany' });
    assert.equal(t.appointment, null); assert.equal(t.client.name, 'Walk In'); assert.equal(t.lines.length, 0);
    await assert.rejects(() => T.pay(t.code, { tender: 'cash' }), (e) => /at least one line/.test(e.message));
    await T.addLine(t.code, { kind: 'service', serviceSlug: 'loc-retwist', variationId: RETWIST_V.id, provider: 'bethany' });
    const got = await T.get(t.code);
    assert.equal(got.lines[0].name, 'Loc Retwist (New Client)'); assert.equal(got.lines[0].gross_cents, RETWIST.price_from_cents);
    const v = await T.voidTicket(t.code, 'test');
    assert.equal(v.status, 'voided');
    await assert.rejects(() => T.pay(t.code, { tender: 'cash' }), (e) => e.status === 409);
    const anon = await T.open({});
    assert.equal(anon.client, null, 'a ticket can exist with no client at all');
    await T.voidTicket(anon.code);
  });

  test('API tokens: scopes enforced, revocation immediate, whoami reports scopes', async () => {
    const tk = await tokens.create({ name: 'test-hub', scopes: ['appointments:read', 'tickets:read', 'nonsense'] });
    assert.match(tk.token, /^ch_/); assert.deepEqual(tk.scopes, ['appointments:read', 'tickets:read']);
    const H = { authorization: 'Bearer ' + tk.token };
    assert.equal((await call(v1, req('GET', { query: { resource: 'whoami' } }))).statusCode, 401);
    assert.equal((await call(v1, req('GET', { query: { resource: 'whoami' }, headers: { authorization: 'Bearer ch_nope' } }))).statusCode, 401);
    const who = await call(v1, req('GET', { query: { resource: 'whoami' }, headers: H }));
    assert.equal(who.statusCode, 200); assert.equal(who.body.name, 'test-hub');
    assert.equal((await call(v1, req('GET', { query: { resource: 'catalog' }, headers: H }))).statusCode, 403, 'no catalog scope');
    assert.equal((await call(v1, req('GET', { query: { resource: 'appointments' }, headers: H }))).statusCode, 400, 'range required');

    const a = await call(v1, req('GET', { query: { resource: 'appointments', from: TOMORROW, to: TOMORROW }, headers: H }));
    assert.equal(a.statusCode, 200);
    const mine = a.body.appointments.find(x => x.client.phone === '16025550888');
    assert.ok(mine, 'appointment listed'); assert.equal(mine.status, 'completed'); assert.equal(mine.segments[0].employee.slug, 'bethany');
    assert.match(mine.ticket_id, /^T-/, 'ticket linked back to the booking');

    const today = todayIn('America/Phoenix');
    const tix = await call(v1, req('GET', { query: { resource: 'tickets', from: addDays(today, -1), to: addDays(today, 1) }, headers: H }));
    assert.equal(tix.statusCode, 200);
    const tt = tix.body.tickets.find(x => x.id === mine.ticket_id);
    assert.ok(tt); assert.equal(tt.status, 'refunded'); assert.equal(tt.appointment_id, mine.id);
    assert.equal(tt.lines.length, 3);
    assert.ok(tt.lines.every(l => l.employee_id && l.gross_cents != null && typeof l.discount_cents === 'number' && typeof l.tax_cents === 'number'), 'employee + gross/discount/tax on every line');
    assert.equal(tt.lines.find(l => l.kind === 'retail').employee.slug, 'test-till');

    // 366-day window is allowed, longer is not; the past is reachable
    assert.equal((await call(v1, req('GET', { query: { resource: 'tickets', from: '2025-01-01', to: '2025-12-31' }, headers: H }))).statusCode, 200);
    assert.equal((await call(v1, req('GET', { query: { resource: 'tickets', from: '2024-01-01', to: '2025-12-31' }, headers: H }))).statusCode, 400);

    const full = await tokens.create({ name: 'test-full', scopes: tokens.SCOPES });
    const HF = { authorization: 'Bearer ' + full.token };
    const cat = await call(v1, req('GET', { query: { resource: 'catalog' }, headers: HF }));
    assert.ok(cat.body.services.length >= 50 && cat.body.retail.some(r => r.sku === 'TEST-OIL'));
    assert.ok(cat.body.services.every(s => s.product_type === 'service') && cat.body.retail.every(r => r.product_type === 'retail'));
    const sch = await call(v1, req('GET', { query: { resource: 'schedule', from: TOMORROW, to: TOMORROW }, headers: HF }));
    assert.ok(sch.body.entries.some(e => e.employee.slug === 'bethany' && e.type === 'shift'));
    const emp = await call(v1, req('GET', { query: { resource: 'employees' }, headers: HF }));
    assert.ok(emp.body.employees.some(e => e.slug === 'bethany' && typeof e.id === 'number'));

    await tokens.revoke(tk.id);
    assert.equal((await call(v1, req('GET', { query: { resource: 'whoami' }, headers: H }))).statusCode, 401, 'revoked immediately');
    const listed = await tokens.list();
    assert.ok(listed.find(x => x.id === tk.id).revokedAt);
    await tokens.revoke(full.id);
  });

  test('front-desk API: open/line/pay/refund through the handler; tax rate setting', async () => {
    const st = await call(staffApi, req('POST', { headers: ADMIN, body: { action: 'settings.save', tax_rate_percent: '8.6' } }));
    assert.equal(st.statusCode, 200); assert.equal(st.body.tax_rate_bps, 860);
    assert.equal((await call(staffApi, req('POST', { headers: ADMIN, body: { action: 'settings.save', tax_rate_percent: '99' } }))).statusCode, 400);
    const o = await call(staffApi, req('POST', { headers: ADMIN, body: { action: 'ticket.open', client: { name: 'Handler Client' } } }));
    assert.equal(o.statusCode, 201);
    const l = await call(staffApi, req('POST', { headers: ADMIN, body: { action: 'ticket.line.add', code: o.body.code, line: { kind: 'service', serviceSlug: 'sleek-ponytail', variationId: PONY_V.id, provider: 'bethany', gross_cents: '115' } } }));
    assert.equal(l.statusCode, 200); assert.equal(l.body.lines[0].gross_cents, 11500);
    const p = await call(staffApi, req('POST', { headers: ADMIN, body: { action: 'ticket.pay', code: o.body.code, tender: 'cash', tipCents: '5' } }));
    assert.equal(p.statusCode, 200); assert.equal(p.body.status, 'paid'); assert.equal(p.body.tip_cents, 500);
    const d = await call(staffApi, req('GET', { headers: ADMIN, query: { action: 'tickets.day', date: todayIn('America/Phoenix') } }));
    assert.ok(d.body.tickets.some(x => x.code === o.body.code));
    const r = await call(staffApi, req('POST', { headers: ADMIN, body: { action: 'ticket.refund', code: o.body.code, amountCents: '120' } }));
    assert.equal(r.body.status, 'refunded');
    assert.equal((await call(staffApi, req('GET', { query: { action: 'tickets.day', date: todayIn('America/Phoenix') } }))).statusCode, 401);
  });
}
