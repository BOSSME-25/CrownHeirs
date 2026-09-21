// Client + salon notifications over plain HTTP — no SDKs.
//   Email: Resend   (RESEND_API_KEY, NOTIFY_FROM_EMAIL)
//   SMS:   Twilio   (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)
//   Salon copies:   NOTIFY_EMAIL, NOTIFY_SMS_TO
// A channel with no credentials is skipped, never an error: a booking must
// succeed whether or not a message can be sent. NOTIFY_DRY_RUN=1 captures
// messages in `outbox` instead of sending (used by tests).

const outbox = [];

function config() {
  const e = process.env;
  return {
    dryRun: e.NOTIFY_DRY_RUN === '1',
    resendKey: e.RESEND_API_KEY, from: e.NOTIFY_FROM_EMAIL || 'Crown Heirs <onboarding@resend.dev>',
    twilioSid: e.TWILIO_ACCOUNT_SID, twilioToken: e.TWILIO_AUTH_TOKEN, twilioFrom: e.TWILIO_FROM_NUMBER,
    salonEmail: e.NOTIFY_EMAIL, salonSms: e.NOTIFY_SMS_TO,
    siteUrl: (e.SITE_URL || 'https://crown-heirs.vercel.app').replace(/\/$/, ''),
    salonName: e.SALON_NAME || 'Crown Heirs Hair Den'
  };
}

// ── transports ─────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, text }) {
  const c = config();
  if (!to) return { channel: 'email', skipped: 'no address' };
  if (c.dryRun) { outbox.push({ channel: 'email', to, subject, text }); return { channel: 'email', sent: true, dryRun: true }; }
  if (!c.resendKey) return { channel: 'email', skipped: 'RESEND_API_KEY not set' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: c.from, to: [to], subject, text })
  });
  if (!r.ok) return { channel: 'email', error: `${r.status} ${(await r.text()).slice(0, 200)}` };
  return { channel: 'email', sent: true };
}

async function sendSms({ to, body }) {
  const c = config();
  if (!to) return { channel: 'sms', skipped: 'no number' };
  const e164 = '+' + String(to).replace(/\D/g, '');
  if (c.dryRun) { outbox.push({ channel: 'sms', to: e164, body }); return { channel: 'sms', sent: true, dryRun: true }; }
  if (!c.twilioSid || !c.twilioToken || !c.twilioFrom) return { channel: 'sms', skipped: 'Twilio not configured' };
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${c.twilioSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${c.twilioSid}:${c.twilioToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ To: e164, From: c.twilioFrom, Body: body }).toString()
  });
  if (!r.ok) return { channel: 'sms', error: `${r.status} ${(await r.text()).slice(0, 200)}` };
  return { channel: 'sms', sent: true };
}

// ── templates ──────────────────────────────────────────────────────────────
const when = (iso, tz) => new Date(iso).toLocaleString('en-US', {
  timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
});
const what = a => a.variation?.name && a.variation.name !== 'Regular'
  ? `${a.service.name} (${a.variation.name})` : a.service.name;

function templates(a, tz) {
  const c = config();
  const manage = `${c.siteUrl}/book?code=${a.code}`;
  const line = `${what(a)} with ${a.stylist.name}, ${when(a.startsAt, tz)}`;
  return {
    booked: {
      sms:   `${c.salonName}: you're booked — ${line}. Code ${a.code}. Manage: ${manage}`,
      subject: `You're booked — ${c.salonName}`,
      email: `Hi ${a.client.name},\n\nYou're on the books.\n\n${line}\nConfirmation code: ${a.code}\n\nLook up or cancel: ${manage}\n\nSee you soon,\n${c.salonName}`,
      salon: `New booking: ${line}. Client ${a.client.name} (${a.client.phone}${a.client.email ? ', ' + a.client.email : ''}). Code ${a.code}${a.notes ? '. Notes: ' + a.notes : ''}`
    },
    cancelled: {
      sms:   `${c.salonName}: your appointment (${line}) has been cancelled. Code ${a.code}. Rebook: ${c.siteUrl}/book`,
      subject: `Appointment cancelled — ${c.salonName}`,
      email: `Hi ${a.client.name},\n\nYour appointment has been cancelled:\n\n${line}\nCode ${a.code}\n\nRebook any time: ${c.siteUrl}/book\n\n${c.salonName}`,
      salon: `Cancelled: ${line}. Client ${a.client.name} (${a.client.phone}). Code ${a.code}`
    },
    reminder: {
      sms:   `${c.salonName} reminder: ${line}. Code ${a.code}. Need to change it? ${manage}`,
      subject: `Reminder: your appointment tomorrow — ${c.salonName}`,
      email: `Hi ${a.client.name},\n\nA reminder of your appointment:\n\n${line}\nCode ${a.code}\n\nNeed to change it? ${manage}\n\n${c.salonName}`
    }
  };
}

// ── events ─────────────────────────────────────────────────────────────────
// `a` = { code, startsAt, service:{name}, variation:{name}, stylist:{name},
//         client:{name, phone, email}, notes }
async function send(kind, a, tz, { salon = true } = {}) {
  const t = templates(a, tz)[kind];
  const c = config();
  const jobs = [
    sendSms({ to: a.client.phone, body: t.sms }),
    sendEmail({ to: a.client.email, subject: t.subject, text: t.email })
  ];
  if (salon && t.salon) {
    jobs.push(sendSms({ to: c.salonSms, body: t.salon }));
    jobs.push(sendEmail({ to: c.salonEmail, subject: t.salon.slice(0, 80), text: t.salon }));
  }
  const results = await Promise.allSettled(jobs);
  return results.map(r => r.status === 'fulfilled' ? r.value : { error: String(r.reason) });
}

const booked    = (a, tz) => send('booked', a, tz);
const cancelled = (a, tz) => send('cancelled', a, tz);
const reminder  = (a, tz) => send('reminder', a, tz, { salon: false });

// Never let a notification failure surface to the caller.
const safely = (p) => p.catch(e => [{ error: String(e) }]);

module.exports = { booked, cancelled, reminder, safely, outbox, sendEmail, sendSms, templates };
