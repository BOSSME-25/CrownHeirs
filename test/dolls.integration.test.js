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
  const base = { name: 'Doll Parent', phone: '602-555-0899', email: 'doll@example.com', shade: 'caramel', hairColor: 'burgundy', hairStyle: 'box-braids',
    base: 'girl', top: 'tee', topColor: 'yellow', bottom: 'skirt', bottomColor: 'pink', shoes: 'sneakers-white' };

  test.before(async () => { await migrate(); await db.query(`DELETE FROM doll_orders WHERE phone = $1`, [PHONE]); });
  test.after(async () => { await db.getPool().end(); });

  test('the choices are served, and a request needs the real ones', async () => {
    const o = await call(dollsApi, req('GET'));
    assert.equal(o.statusCode, 200); assert.equal(o.body.maxQuantity, 5);
    const n = k => o.body[k].length;
    assert.deepEqual([n('bases'), n('shades'), n('hairStyles'), n('tops'), n('bottoms'), n('shoes'), n('accessories'), n('backgrounds')], [2, 5, 12, 6, 5, 5, 6, 2]);
    assert.ok(o.body.hairColors.length >= 12);
    assert.deepEqual(o.body.shades.map(s => s.name), ['Rich Espresso', 'Deep Brown', 'Warm Brown', 'Golden Brown', 'Caramel']);
    for (const [bad, msg] of [[{ ...base, name: 'A' }, /name/], [{ ...base, phone: '123' }, /phone/], [{ ...base, shade: 'neon' }, /complexion/], [{ ...base, hairColor: 'x' }, /colour/], [{ ...base, hairStyle: 'mullet' }, /style/], [{ ...base, email: 'nope' }, /email/],
      [{ ...base, base: 'alien' }, /base/], [{ ...base, top: 'cape' }, /top/], [{ ...base, topColor: 'neon' }, /colour/], [{ ...base, shoes: '' }, /shoes/],
      [{ ...base, accessories: ['crown'] }, /isn't available/], [{ ...base, hairStyle: 'afro-puffs', accessories: ['hat'] }, /can't sit on afro puffs/], [{ ...base, accessories: ['cape'] }, /accessories/]]) {
      const r = await call(dollsApi, req('POST', { body: bad }));
      assert.equal(r.statusCode, 400, JSON.stringify(r.body)); assert.match(r.body.error, msg);
    }
  });

  let CODE;
  test('a request is stored with its wishes, the client and the salon are told', async () => {
    notify.outbox.length = 0;
    const look = 'b=girl&c=caramel&h=box-braids&hc=burgundy&t=tee.yellow&p=skirt.pink&s=sneakers-white&a=bag,glasses';
    const r = await call(dollsApi, req('POST', { body: { ...base, quantity: 2, accessories: ['bag', 'glasses', 'bag'], look, notes: 'a name on the shirt please', forWhom: 'Ava, turning 6' } }));
    assert.equal(r.statusCode, 201, JSON.stringify(r.body));
    const d = r.body; CODE = d.code;
    assert.match(d.code, /^DL-[A-Z2-9]{5}$/); assert.equal(d.status, 'new'); assert.equal(d.quantity, 2);
    assert.equal(d.summary, 'Caramel girl, burgundy box braids');
    assert.equal(d.wishes, 'Yellow tee, Pink skirt, White sneakers; with crossbody bag, glasses');
    assert.deepEqual(d.outfit, { base: 'girl', top: 'tee', topColor: 'yellow', bottom: 'skirt', bottomColor: 'pink', shoes: 'sneakers-white', shoesColor: null, accessories: ['bag', 'glasses'], look });
    assert.equal(d.client.phone, PHONE);
    const sms = notify.outbox.filter(m => m.channel === 'sms');
    assert.ok(sms.some(m => m.to === '+' + PHONE && /2 dolls/.test(m.body) && m.body.includes(d.code) && /can't be promised/.test(m.body)), 'client texted');
    assert.ok(sms.some(m => m.to === '+16025550000' && /New doll request/.test(m.body) && /Yellow tee/.test(m.body)), 'salon texted');
    assert.ok(notify.outbox.some(m => m.channel === 'email' && m.to === 'desk@example.com' && /Ava, turning 6/.test(m.text)), 'salon emailed with who it is for');
    const l = await call(dollsApi, req('GET', { query: { code: d.code.toLowerCase() } }));
    assert.equal(l.statusCode, 200); assert.equal(l.body.code, d.code);
    assert.equal((await call(dollsApi, req('GET', { query: { code: 'DL-NOPE1' } }))).statusCode, 404);
  });

  test('highlights: a second colour from the same list, never the same one twice', async () => {
    const o = (await call(dollsApi, req('GET'))).body;
    assert.ok(!o.hairColors.some(c => c.id === 'mixed'), 'mixed is gone; two colours replace it');
    const ok = await call(dollsApi, req('POST', { body: { ...base, hairColor: 'burgundy', hairColor2: 'honey-blonde' } }));
    assert.equal(ok.statusCode, 201, JSON.stringify(ok.body));
    assert.equal(ok.body.summary, 'Caramel girl, burgundy box braids with honey blonde highlights');
    assert.equal(ok.body.hairColor2, 'honey-blonde');
    const same = await call(dollsApi, req('POST', { body: { ...base, hairColor: 'burgundy', hairColor2: 'burgundy' } }));
    assert.equal(same.statusCode, 400); assert.match(same.body.error, /differs/);
    const bad = await call(dollsApi, req('POST', { body: { ...base, hairColor2: 'neon' } }));
    assert.equal(bad.statusCode, 400); assert.match(bad.body.error, /second hair colour/);
    const one = await call(dollsApi, req('POST', { body: { ...base, hairColor2: '' } }));
    assert.equal(one.body.hairColor2, null); assert.equal(one.body.summary, 'Caramel girl, burgundy box braids');
  });

  test('a garment with no colour picked takes its own; a bad share link is dropped; older requests still read', async () => {
    const r = await call(dollsApi, req('POST', { body: { ...base, base: 'boy', hairStyle: 'short-curls', top: 'ch-sweater', topColor: undefined, bottom: 'jeans', bottomColor: undefined, shoes: 'boots', look: '<script>' } }));
    assert.equal(r.statusCode, 201, JSON.stringify(r.body));
    assert.equal(r.body.summary, 'Caramel boy, burgundy short curls / fade');
    assert.equal(r.body.wishes, 'Royal blue Crown Heirs sweater, Blue jeans, Brown boots');
    assert.equal(r.body.outfit.look, '');
    const old = D.describe({ shade: 'cocoa', hair_color: 'black', hair_style: 'locs', outfit: { top: 'yellow dress', colors: 'pink' } });
    assert.deepEqual(old, { doll: 'Cocoa yarn, Black locs', wishes: 'top/dress: yellow dress, colours: pink' });
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
