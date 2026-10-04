// Square Terminal at the till, against Postgres with Square stubbed: pairing a
// device, pushing a ticket's amount due, the Terminal completing it with a
// tip, cancelling, and the guards.
const test = require('node:test');
const assert = require('node:assert/strict');

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  test('terminal integration (skipped: no TEST_DATABASE_URL)', { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = url;
  process.env.BOOKING_MODE = 'site';
  process.env.NOTIFY_DRY_RUN = '1';
  process.env.ADMIN_PASSWORD = 'test-admin-key';
  const db = require('../lib/db');
  const { migrate, seed } = require('../lib/setup');
  const B = require('../lib/booking');
  const T = require('../lib/tickets');
  const square = require('../lib/square');
  const staffApi = require('../api/book/staff');

  const req = (method, { query = {}, body, headers = {} } = {}) => ({ method, query, body, headers });
  const res = () => ({ statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; } });
  const call = async (h, r) => { const s = res(); await h(r, s); return s; };
  const ADMIN = { 'x-admin-key': 'test-admin-key' };

  // This suite owns phone …0895 and the square_device_* settings.
  const PHONE = '16025550895';
  let RETWIST_V;

  // A fake Square: device codes that pair on the second look, checkouts that
  // move PENDING → IN_PROGRESS → COMPLETED on each poll, a payment with a tip.
  const calls = [];
  const state = { pairLooks: 0, checkouts: {}, failCancel: false };
  const ok = (o) => ({ ok: true, status: 200, json: async () => o });
  square._setFetch(async (u, opts = {}) => {
    const m = opts.method || 'GET'; const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ m, u, body });
    let x;
    if (m === 'POST' && (x = u.match(/\/v2\/devices\/codes$/))) return ok({ device_code: { id: 'DC1', code: 'ABCDEF', status: 'UNPAIRED', name: body.device_code.name } });
    if (m === 'GET' && (x = u.match(/\/v2\/devices\/codes\/DC1$/))) { state.pairLooks++; return ok({ device_code: { id: 'DC1', code: 'ABCDEF', name: 'Front till', status: state.pairLooks >= 2 ? 'PAIRED' : 'UNPAIRED', device_id: state.pairLooks >= 2 ? 'DEV1' : undefined } }); }
    if (m === 'GET' && /\/v2\/devices\?/.test(u)) return ok({ devices: [{ id: 'DEV1', attributes: { name: 'Front till', model: 'T2' }, status: { category: 'AVAILABLE' } }] });
    if (m === 'POST' && /\/v2\/terminals\/checkouts$/.test(u)) {
      const id = 'TC' + (Object.keys(state.checkouts).length + 1);
      state.checkouts[id] = { id, status: 'PENDING', amount_money: body.checkout.amount_money, device_options: body.checkout.device_options, reference_id: body.checkout.reference_id, polls: 0, tipping: body.checkout.device_options.tip_settings.allow_tipping };
      return ok({ checkout: state.checkouts[id] });
    }
    if (m === 'POST' && (x = u.match(/\/v2\/terminals\/checkouts\/(\w+)\/cancel$/))) {
      if (state.failCancel) return { ok: false, status: 400, json: async () => ({ errors: [{ code: 'BAD_REQUEST', detail: 'already completed' }] }) };
      const c = state.checkouts[x[1]]; c.status = 'CANCELED'; c.cancel_reason = 'SELLER_CANCELED'; return ok({ checkout: c });
    }
    if (m === 'GET' && (x = u.match(/\/v2\/terminals\/checkouts\/(\w+)$/))) {
      const c = state.checkouts[x[1]]; c.polls++;
      if (c.status === 'PENDING') c.status = 'IN_PROGRESS';
      else if (c.status === 'IN_PROGRESS' && c.polls >= 3) { c.status = 'COMPLETED'; c.payment_ids = ['PAY_' + c.id]; }
      return ok({ checkout: c });
    }
    if (m === 'GET' && (x = u.match(/\/v2\/payments\/PAY_(\w+)$/))) {
      const c = state.checkouts[x[1]];
      return ok({ payment: { id: 'PAY_' + c.id, status: 'COMPLETED', amount_money: c.amount_money, tip_money: { amount: 500, currency: 'USD' }, total_money: { amount: c.amount_money.amount + 500, currency: 'USD' }, card_details: { card: { card_brand: 'VISA', last_4: '4242' } }, receipt_number: 'R123' } });
    }
    return { ok: false, status: 404, json: async () => ({ errors: [{ code: 'NOT_FOUND', detail: u }] }) };
  });

  test.before(async () => {
    await migrate(); await seed();
    await db.query(`DELETE FROM ticket_refunds WHERE ticket_id IN (SELECT id FROM tickets WHERE client_id IN (SELECT id FROM clients WHERE phone = $1))`, [PHONE]);
    await db.query(`DELETE FROM tickets WHERE client_id IN (SELECT id FROM clients WHERE phone = $1)`, [PHONE]);
    await db.query(`DELETE FROM clients WHERE phone = $1`, [PHONE]);
    await db.query(`DELETE FROM settings WHERE key IN ('square_device_id', 'square_device_name')`);
    const all = (await B.listServices()).flatMap(c => c.services);
    RETWIST_V = all.find(s => s.slug === 'loc-retwist').variations[0];
  });
  test.after(async () => {
    square._setFetch((...a) => fetch(...a));
    delete process.env.SQUARE_ACCESS_TOKEN; delete process.env.SQUARE_LOCATION_ID; delete process.env.SQUARE_ENV;
    await db.query(`DELETE FROM settings WHERE key IN ('square_device_id', 'square_device_name')`);
    await db.getPool().end();
  });

  const openPriced = async () => {
    const t = await T.open({ client: { name: 'Terminal Client', phone: '602-555-0895' }, rungBy: 'bethany' });
    await T.addLine(t.code, { kind: 'service', serviceSlug: 'loc-retwist', variationId: RETWIST_V.id, provider: 'bethany', gross_cents: 8000 });
    return T.get(t.code);
  };

  test('without Square, the Terminal is off and the till records cards by hand', async () => {
    const s = await call(staffApi, req('GET', { headers: ADMIN, query: { action: 'terminal.status' } }));
    assert.equal(s.statusCode, 200); assert.equal(s.body.configured, false); assert.equal(s.body.device, null);
    const t = await openPriced();
    await assert.rejects(() => T.terminalStart(t.code), (e) => e.status === 400 && /not connected/.test(e.message));
    const p = await call(staffApi, req('POST', { headers: ADMIN, body: { action: 'terminal.pair' } }));
    assert.equal(p.statusCode, 400);
    await T.voidTicket(t.code);
  });

  test('pairing: a code is created, typed into the Terminal, and the device is kept once PAIRED', async () => {
    process.env.SQUARE_ACCESS_TOKEN = 'test-token'; process.env.SQUARE_LOCATION_ID = 'LOC1'; process.env.SQUARE_ENV = 'sandbox';
    const t = await openPriced();
    await assert.rejects(() => T.terminalStart(t.code), (e) => e.status === 400 && /No Square Terminal is paired/.test(e.message));
    const p = await call(staffApi, req('POST', { headers: ADMIN, body: { action: 'terminal.pair', name: 'Front till' } }));
    assert.equal(p.statusCode, 201, JSON.stringify(p.body)); assert.equal(p.body.code, 'ABCDEF'); assert.equal(p.body.status, 'UNPAIRED');
    assert.equal(calls.at(-1).body.device_code.location_id, 'LOC1'); assert.equal(calls.at(-1).body.device_code.product_type, 'TERMINAL_API');
    const first = await call(staffApi, req('GET', { headers: ADMIN, query: { action: 'terminal.pair.check', id: 'DC1' } }));
    assert.equal(first.body.status, 'UNPAIRED'); assert.equal(first.body.device, null);
    const second = await call(staffApi, req('GET', { headers: ADMIN, query: { action: 'terminal.pair.check', id: 'DC1' } }));
    assert.equal(second.body.status, 'PAIRED'); assert.deepEqual(second.body.device, { id: 'DEV1', name: 'Front till' });
    const s = await call(staffApi, req('GET', { headers: ADMIN, query: { action: 'terminal.status' } }));
    assert.equal(s.body.configured, true); assert.equal(s.body.env, 'sandbox'); assert.equal(s.body.device.id, 'DEV1');
    const d = await call(staffApi, req('GET', { headers: ADMIN, query: { action: 'terminal.devices' } }));
    assert.equal(d.body.devices[0].name, 'Front till'); assert.equal(d.body.devices[0].model, 'T2');
    await T.voidTicket(t.code);
  });

  test('checkout: the amount due goes to the device; polling pays the ticket as card with the Square payment id and the tip', async () => {
    const t = await openPriced();
    const started = await T.terminalStart(t.code);
    assert.equal(started.status, 'open'); assert.equal(started.terminal.status, 'PENDING'); assert.equal(started.terminal.device, 'Front till'); assert.equal(started.terminal.amountCents, 8000);
    const create = calls.findLast(c => /terminals\/checkouts$/.test(c.u)).body.checkout;
    assert.equal(create.amount_money.amount, 8000); assert.equal(create.device_options.device_id, 'DEV1'); assert.equal(create.reference_id, t.code); assert.equal(create.payment_type, 'CARD_PRESENT');
    assert.equal(create.device_options.tip_settings.allow_tipping, true);
    // Starting again while it is live does not push a second checkout.
    const again = await T.terminalStart(t.code);
    assert.equal(Object.keys(state.checkouts).length, 1); assert.equal(again.terminal.status, 'IN_PROGRESS');
    let s = await T.terminalStatus(t.code); assert.equal(s.status, 'open'); assert.equal(s.terminal.status, 'IN_PROGRESS');
    s = await T.terminalStatus(t.code);
    assert.equal(s.status, 'paid', JSON.stringify(s.terminal));
    assert.equal(s.tender, 'card'); assert.equal(s.tenderRef, 'PAY_TC1 VISA 4242'); assert.equal(s.tip_cents, 500); assert.equal(s.terminal.status, 'COMPLETED');
    assert.equal(s.terminal.payment.receiptNumber, 'R123');
    // A later poll is harmless.
    const after = await T.terminalStatus(t.code); assert.equal(after.status, 'paid'); assert.equal(after.tip_cents, 500);
    // The handler shape.
    const h = await call(staffApi, req('GET', { headers: ADMIN, query: { action: 'ticket.terminal.status', code: t.code } }));
    assert.equal(h.statusCode, 200); assert.equal(h.body.status, 'paid');
  });

  test('cancel: the desk takes it back off the Terminal and the ticket stays open; nothing due means no checkout', async () => {
    const t = await openPriced();
    const h = await call(staffApi, req('POST', { headers: ADMIN, body: { action: 'ticket.terminal.start', code: t.code, tipping: false } }));
    assert.equal(h.statusCode, 200, JSON.stringify(h.body)); assert.equal(h.body.terminal.status, 'PENDING');
    assert.equal(calls.findLast(c => /terminals\/checkouts$/.test(c.u)).body.checkout.device_options.tip_settings.allow_tipping, false);
    const c = await call(staffApi, req('POST', { headers: ADMIN, body: { action: 'ticket.terminal.cancel', code: t.code } }));
    assert.equal(c.body.status, 'open'); assert.equal(c.body.terminal.status, 'CANCELED');
    // After a cancel, a fresh start makes a new checkout.
    const re = await T.terminalStart(t.code);
    assert.equal(re.terminal.checkoutId, 'TC3'); assert.equal(re.terminal.status, 'PENDING');
    // Cancel that Square refuses because it already completed: the status is re-read, not thrown.
    state.failCancel = true;
    state.checkouts.TC3.status = 'COMPLETED'; state.checkouts.TC3.payment_ids = ['PAY_TC3']; state.checkouts.TC3.polls = 9;
    const c2 = await T.terminalCancel(t.code);
    assert.equal(c2.terminal.status, 'COMPLETED');
    const paid = await T.terminalStatus(t.code); assert.equal(paid.status, 'paid');
    state.failCancel = false;
    // Deposit covers the whole ticket → nothing to push.
    const z = await openPriced();
    await db.query(`UPDATE tickets SET deposit_cents = 8000 WHERE code = $1`, [z.code]);
    await assert.rejects(() => T.terminalStart(z.code), (e) => e.status === 400 && /Nothing is due/.test(e.message));
    await T.voidTicket(z.code);
    // Forget the device.
    const f = await call(staffApi, req('POST', { headers: ADMIN, body: { action: 'terminal.forget' } }));
    assert.equal(f.body.device, null);
    const u = await call(staffApi, req('POST', { headers: ADMIN, body: { action: 'terminal.use', deviceId: 'DEV1', name: 'Front till' } }));
    assert.equal(u.body.device.id, 'DEV1');
  });
}
