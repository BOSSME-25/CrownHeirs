// Notification templates and routing, with transports in dry-run (no network).
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NOTIFY_DRY_RUN = '1';
process.env.NOTIFY_EMAIL = 'desk@example.com';
process.env.NOTIFY_SMS_TO = '16025550000';
const notify = require('../lib/notify');

const appt = {
  code: 'CH-ABC23', startsAt: '2026-09-22T16:00:00.000Z',
  service: { name: 'Loc Retwist' }, variation: { name: 'New Client' }, stylist: { name: 'Bethany' },
  client: { name: 'Test Client', phone: '16025550142', email: 'client@example.com' }, notes: 'first visit'
};

test('booked: client gets SMS + email, salon gets both; Phoenix time in the copy', async () => {
  notify.outbox.length = 0;
  const r = await notify.booked(appt, 'America/Phoenix');
  assert.equal(r.filter(x => x.sent).length, 4);
  const sms = notify.outbox.find(m => m.channel === 'sms' && m.to === '+16025550142');
  assert.match(sms.body, /Loc Retwist \(New Client\) with Bethany, Tue, Sep 22, 9:00 AM/);
  assert.match(sms.body, /CH-ABC23/);
  assert.match(sms.body, /\/book\?code=CH-ABC23/);
  const salon = notify.outbox.find(m => m.channel === 'email' && m.to === 'desk@example.com');
  assert.match(salon.text, /New booking/); assert.match(salon.text, /16025550142/); assert.match(salon.text, /first visit/);
});

test('reminder goes to the client only; "Regular" variation is not shown', async () => {
  notify.outbox.length = 0;
  await notify.reminder({ ...appt, variation: { name: 'Regular' }, client: { ...appt.client, email: null } }, 'America/Phoenix');
  assert.equal(notify.outbox.length, 1);
  assert.equal(notify.outbox[0].channel, 'sms');
  assert.match(notify.outbox[0].body, /reminder: Loc Retwist with Bethany/);
  assert.doesNotMatch(notify.outbox[0].body, /Regular/);
});

test('unconfigured channels are skipped, never thrown', async () => {
  process.env.NOTIFY_DRY_RUN = '0';
  delete process.env.RESEND_API_KEY; delete process.env.TWILIO_ACCOUNT_SID;
  const r = await notify.cancelled(appt, 'America/Phoenix');
  assert.ok(r.every(x => x.skipped));
  assert.deepEqual(await notify.safely(Promise.reject(new Error('boom'))), [{ error: 'Error: boom' }]);
  process.env.NOTIFY_DRY_RUN = '1';
});
