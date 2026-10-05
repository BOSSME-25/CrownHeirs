// Crown Heirs Dolls against Postgres: the choices, a request with its
// messages, validation, the desk moving it along, and the handlers.
const test = require('node:test');
const assert = require('node:assert/strict');

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  test('dolls integration (skipped: no TEST_DATABASE_URL)', { skip: true }, () => {});
} else {
  process.env.DATABASE_URL = url;
  process.env.NOTIFY_DRY_RUN = '1';
  process.env.NOTIFY_EMAIL = 'desk@example.com';
  process.env.NOTIFY_SMS_TO = '16025550000';
  process.env.ADMIN_PASSWORD = 'test-admin-key';
  const db = require('../lib/db');
  const { migrate } = require('../lib/setup');
  const D = require('../lib/dolls');
  const notify = require('../lib/notify');
  const dollsApi = require('../api/dolls');
  const staffApi = require('../api/book/staff');

  const req = (method, { query = {}, body, headers = {} } = {}) => ({ method, query, body, headers });
  const res = () => ({ statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; } });
  const call = async (h, r) => { const s = res(); await h(r, s); return s; };
  const ADMIN = { 'x-admin-key': 'test-admin-key' };
  // This suite owns phone …0899.
  const PHONE = '16025550899';
  const base = { name: 'Doll Parent', phone: '602-555-0899', email: 'doll@example.com', shade: 'caramel', hairColor: 'burgundy', hairStyle: 'box-braids' };

  test.before(async () => { await migrate(); await db.query(`DELETE FROM doll_orders WHERE phone = $1`, [PHONE]); });
  test.after(async () => { await db.getPool().end(); });

  test('the choices are served, and a request needs the real ones', async () => {
    const o = await call(dollsApi, req('GET'));
    assert.equal(o.statusCode, 200); assert.equal(o.body.shades.length, 8); assert.ok(o.body.hairColors.length >= 12); assert.equal(o.body.hairStyles.length, 10); assert.equal(o.body.maxQuantity, 5);
    for (const [bad, msg] of [[{ ...base, name: 'A' }, /name/], [{ ...base, phone: '123' }, /phone/], [{ ...base, shade: 'neon' }, /shade/], [{ ...base, hairColor: 'x' }, /colour/], [{ ...base, hairStyle: 'mullet' }, /style/], [{ ...base, email: 'nope' }, /email/]]) {
      const r = await call(dollsApi, req('POST', { body: bad }));
      assert.equal(r.statusCode, 400, JSON.stringify(r.body)); assert.match(r.body.error, msg);
    }
  });

  let CODE;
  test('a request is stored with its wishes, the client and the salon are told', async () => {
    notify.outbox.length = 0;
    const r = await call(dollsApi, req('POST', { body: { ...base, quantity: 2, outfit: { top: 'yellow dress', shoes: 'white sneakers', colors: 'pink and gold' }, notes: 'a bow please', forWhom: 'Ava, turning 6' } }));
    assert.equal(r.statusCode, 201, JSON.stringify(r.body));
    const d = r.body; CODE = d.code;
    assert.match(d.code, /^DL-[A-Z2-9]{5}$/); assert.equal(d.status, 'new'); assert.equal(d.quantity, 2);
    assert.equal(d.summary, 'Caramel yarn, Burgundy box braids');
    assert.equal(d.wishes, 'top/dress: yellow dress, shoes: white sneakers, colours: pink and gold');
    assert.equal(d.outfit.bottom, ''); assert.equal(d.client.phone, PHONE);
    const sms = notify.outbox.filter(m => m.channel === 'sms');
    assert.ok(sms.some(m => m.to === '+' + PHONE && /2 dolls/.test(m.body) && m.body.includes(d.code) && /can't be promised/.test(m.body)), 'client texted');
    assert.ok(sms.some(m => m.to === '+16025550000' && /New doll request/.test(m.body) && /yellow dress/.test(m.body)), 'salon texted');
    assert.ok(notify.outbox.some(m => m.channel === 'email' && m.to === 'desk@example.com' && /Ava, turning 6/.test(m.text)), 'salon emailed with who it is for');
    const l = await call(dollsApi, req('GET', { query: { code: d.code.toLowerCase() } }));
    assert.equal(l.statusCode, 200); assert.equal(l.body.code, d.code);
    assert.equal((await call(dollsApi, req('GET', { query: { code: 'DL-NOPE1' } }))).statusCode, 404);
  });

  test('the desk lists requests and moves one along; the client hears about the quote and when it is ready', async () => {
    const l = await call(staffApi, req('GET', { headers: ADMIN, query: { action: 'dolls.list' } }));
    assert.equal(l.statusCode, 200); assert.ok(l.body.dolls.some(d => d.code === CODE)); assert.deepEqual(l.body.statuses, D.STATUSES);
    assert.equal((await call(staffApi, req('GET', { query: { action: 'dolls.list' } }))).statusCode, 401);
    notify.outbox.length = 0;
    const q = await call(staffApi, req('POST', { headers: ADMIN, body: { action: 'doll.status', code: CODE, status: 'quoted', quote: '$45 each, about 2 weeks' } }));
    assert.equal(q.statusCode, 200, JSON.stringify(q.body)); assert.equal(q.body.status, 'quoted'); assert.equal(q.body.quote, '$45 each, about 2 weeks');
    assert.ok(notify.outbox.some(m => m.channel === 'sms' && m.to === '+' + PHONE && /\$45 each/.test(m.body)), 'client gets the quote');
    notify.outbox.length = 0;
    const m = await D.setStatus(CODE, { status: 'making', tell: false });
    assert.equal(m.status, 'making'); assert.equal(m.quote, '$45 each, about 2 weeks', 'quote kept'); assert.equal(notify.outbox.length, 0, 'quiet when asked');
    const r = await D.setStatus(CODE, { status: 'ready' });
    assert.equal(r.status, 'ready'); assert.ok(notify.outbox.some(x => /ready to pick up/.test(x.body || '')));
    await assert.rejects(() => D.setStatus(CODE, { status: 'lost' }), (e) => e.status === 400);
    await assert.rejects(() => D.setStatus('DL-NOPE1', { status: 'done' }), (e) => e.status === 404);
    const only = await D.list({ status: 'ready' });
    assert.ok(only.every(d => d.status === 'ready'));
  });
}
