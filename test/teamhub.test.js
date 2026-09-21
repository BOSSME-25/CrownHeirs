// Team Hub integration, with the network stubbed. No database needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const hub = require('../lib/teamhub');

const appt = {
  code: 'CH-7K3M9', status: 'confirmed', startsAt: '2026-09-22T16:00:00.000Z', endsAt: '2026-09-22T17:30:00.000Z',
  service: { name: 'Loc Retwist' }, variation: { name: 'New Client' },
  stylist: { slug: 'bethany', name: 'Bethany', email: 'Bethany@CrownHeirs.com' },
  client: { name: 'Test Client', phone: '16025550142', email: null }, notes: 'first visit'
};
const jsonRes = (status, body) => ({ ok: status < 300, status, json: async () => body });

test('payload: what the hub\'s tolerant ingester needs, ids it can map, our status vocabulary', () => {
  const p = hub.payload(appt);
  assert.equal(p.id, 'CH-7K3M9');
  assert.equal(p.calendarId, 'bethany');
  assert.equal(p.userId, 'bethany@crownheirs.com');
  assert.equal(p.title, 'Loc Retwist (New Client)');
  assert.equal(p.contactName, 'Test Client');
  assert.equal(p.startTime, '2026-09-22T16:00:00.000Z');
  assert.equal(p.status, 'booked');
  assert.equal(hub.payload({ ...appt, status: 'no_show' }).status, 'no_show');
  assert.equal(hub.payload({ ...appt, status: 'completed' }).status, 'completed');
  assert.equal(hub.payload({ ...appt, variation: { name: 'Regular' } }).title, 'Loc Retwist');
});

test('push: unconfigured is skipped; ok / 401 / network failure never throw', async () => {
  delete process.env.TEAMHUB_URL; delete process.env.TEAMHUB_SECRET;
  assert.deepEqual(await hub.pushAppointment(appt), { skipped: 'Team Hub not configured' });

  process.env.TEAMHUB_URL = 'https://team.example.com/'; process.env.TEAMHUB_SECRET = 's3cret';
  let seen;
  hub._setFetch(async (url, opts) => { seen = { url, opts }; return jsonRes(200, { ok: true, appointmentId: 'CH-7K3M9', stylistMatched: true }); });
  assert.deepEqual(await hub.pushAppointment(appt), { sent: true, matched: true, note: null });
  assert.equal(seen.url, 'https://team.example.com/api/webhooks/highlevel');
  assert.equal(seen.opts.headers['x-webhook-secret'], 's3cret');
  assert.equal(JSON.parse(seen.opts.body).calendarId, 'bethany');

  hub._setFetch(async () => jsonRes(200, { ok: true, stylistMatched: false, note: 'No stylist mapping' }));
  assert.equal((await hub.pushAppointment(appt)).matched, false);
  hub._setFetch(async () => jsonRes(401, { error: 'Invalid or missing webhook secret' }));
  assert.match((await hub.pushAppointment(appt)).error, /401.*secret/);
  hub._setFetch(async () => { throw new Error('ECONNREFUSED'); });
  assert.match((await hub.pushAppointment(appt)).error, /Could not reach Team Hub/);
});

test('schedule: hub entries become working blocks; time off and missing days close the book', async () => {
  const feed = { timezone: 'America/Phoenix', entries: [
    { email: 'Bethany@CrownHeirs.com', name: 'Bethany', date: '2026-09-22', start: '10:00', end: '14:30', type: 'shift' },
    { email: 'bethany@crownheirs.com', name: 'Bethany', date: '2026-09-22', start: '15:00', end: '18:00', type: 'shift' },
    { email: 'bethany@crownheirs.com', name: 'Bethany', date: '2026-09-23', start: null, end: null, type: 'time_off' },
    { email: 'sam@crownheirs.com', name: 'Sam', date: '2026-09-22', start: '09:00', end: '17:00', type: 'shift' }
  ] };
  const data = hub.normalizeSchedule(feed);
  assert.deepEqual(hub.hubHours(data, 'BETHANY@crownheirs.com', '2026-09-22'),
    [{ weekday: 2, startMin: 600, endMin: 870 }, { weekday: 2, startMin: 900, endMin: 1080 }]);
  assert.deepEqual(hub.hubHours(data, 'bethany@crownheirs.com', '2026-09-23'), [], 'approved time off');
  assert.deepEqual(hub.hubHours(data, 'bethany@crownheirs.com', '2026-09-24'), [], 'no published shift');
  assert.deepEqual(hub.hubHours(data, 'nobody@crownheirs.com', '2026-09-22'), [], 'unknown to the hub');

  let calls = 0;
  hub._setFetch(async (url) => { calls++; assert.match(url, /\/api\/integrations\/schedule\?from=2026-09-22&to=2026-09-22$/); return jsonRes(200, feed); });
  hub._clearCache();
  const a = await hub.fetchSchedule('2026-09-22', '2026-09-22');
  const b = await hub.fetchSchedule('2026-09-22', '2026-09-22');
  assert.equal(calls, 1, 'cached within a minute'); assert.equal(a, b);
  hub._setFetch(async () => jsonRes(401, {}));
  hub._clearCache();
  await assert.rejects(() => hub.fetchSchedule('2026-09-22', '2026-09-22'), /401/);
});

test('status: reports configured / rejected secret / connected', async () => {
  delete process.env.TEAMHUB_URL;
  assert.equal((await hub.status()).configured, false);
  process.env.TEAMHUB_URL = 'https://team.example.com'; process.env.TEAMHUB_SECRET = 'x';
  hub._setFetch(async () => jsonRes(401, {}));
  assert.match((await hub.status()).detail, /rejected the secret/);
  hub._setFetch(async () => jsonRes(200, { entries: [{}, {}] }));
  const s = await hub.status();
  assert.equal(s.ok, true); assert.match(s.detail, /2 schedule entries/);
  delete process.env.TEAMHUB_URL; delete process.env.TEAMHUB_SECRET; hub._setFetch((...a) => fetch(...a));
});
