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
    salonName: e.SALON_NAME || 'Crown Heirs Hair Den',
    salonPhone: e.SALON_PHONE || '(480) 457-0165'
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

const depositLine = d => !d || !d.cents ? '' : d.status === 'paid' ? ` Deposit of $${(d.cents / 100).toFixed(0)} received.` : d.status === 'due' ? ` Deposit due: $${(d.cents / 100).toFixed(0)}${d.payUrl ? ' — pay here: ' + d.payUrl : ', payable at the salon or by the link we send you'}.` : '';
const cancelDeposit = a => !a.deposit || !a.deposit.cents ? '' : a.deposit.forfeited ? ` Your deposit was forfeited because the cancellation was inside our notice window.` : a.deposit.status === 'paid' ? ' Your deposit stays on your account for your next booking.' : '';
const themeLine = t => !t ? '' : (t.fit === false
  ? ` Note: ${t.name}. Your appointment may be moved to make room.`
  : ` It's ${t.name}${t.headline ? ': ' + t.headline : ''}.`);
function templates(a, tz) {
  const c = config();
  const manage = `${c.siteUrl}/book?code=${a.code}`;
  const line = `${what(a)} with ${a.stylist.name}, ${when(a.startsAt, tz)}` + themeLine(a.theme);
  return {
    booked: {
      sms:   `${c.salonName}: you're booked — ${line}. Code ${a.code}.${depositLine(a.deposit)} Manage: ${manage}`,
      subject: `You're booked — ${c.salonName}`,
      email: `Hi ${a.client.name},\n\nYou're on the books.\n\n${line}\nConfirmation code: ${a.code}${depositLine(a.deposit) ? '\n' + depositLine(a.deposit).trim() : ''}${a.deposit && a.deposit.terms ? '\n\n' + a.deposit.terms : ''}\n\nLook up or cancel: ${manage}\n\nSee you soon,\n${c.salonName}`,
      salon: `New booking: ${line}. Client ${a.client.name} (${a.client.phone}${a.client.email ? ', ' + a.client.email : ''}). Code ${a.code}${a.notes ? '. Notes: ' + a.notes : ''}`
    },
    cancelled: {
      sms:   `${c.salonName}: your appointment (${line}) has been cancelled. Code ${a.code}.${cancelDeposit(a)} Rebook: ${c.siteUrl}/book`,
      subject: `Appointment cancelled — ${c.salonName}`,
      email: `Hi ${a.client.name},\n\nYour appointment has been cancelled:\n\n${line}\nCode ${a.code}${cancelDeposit(a) ? '\n' + cancelDeposit(a).trim() : ''}\n\nRebook any time: ${c.siteUrl}/book\n\n${c.salonName}`,
      salon: `Cancelled: ${line}. Client ${a.client.name} (${a.client.phone}). Code ${a.code}`
    },
    moved: {
      sms:   `${c.salonName}: your appointment has been moved. New time: ${line}. Code ${a.code}. Questions? ${c.salonPhone || manage}`,
      subject: `Your appointment has been moved — ${c.salonName}`,
      email: `Hi ${a.client.name},\n\nWe've moved your appointment${a.moveReason ? ' (' + a.moveReason + ')' : ''}.\n\nNew time: ${line}\nCode ${a.code}\n\nIf that doesn't work, reply to this email or call us and we'll find another.\n\n${c.salonName}`
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

// ── family visits: one message to the holder, listing everyone ────────────
// `v` = { code, holder:{name,phone,email}, people:[{name, service:{name}, variation:{name}, stylist:{name}, startsAt, status}], notes }
function familyTemplates(v, tz) {
  const c = config();
  const manage = `${c.siteUrl}/book?code=${v.code}`;
  const legs = v.people.filter(p => p.status !== 'cancelled' || v.status === 'cancelled');
  const lines = legs.map(p => `${p.name}: ${what(p)} with ${p.stylist.name}, ${when(p.startsAt, tz)}`);
  const first = legs.map(p => new Date(p.startsAt)).sort((a, b) => a - b)[0];
  const short = `${legs.length} appointments, ${when(first, tz)}` + themeLine(v.theme);
  return {
    booked: {
      sms:   `${c.salonName}: you're booked. ${lines.join('; ')}. Code ${v.code}.${depositLine(v.deposit)} Manage: ${manage}`,
      subject: `You're booked, ${legs.length} appointments — ${c.salonName}`,
      email: `Hi ${v.holder.name},\n\nYou're on the books.\n\n${lines.join('\n')}\n\nConfirmation code: ${v.code}${depositLine(v.deposit) ? '\n' + depositLine(v.deposit).trim() : ''}${v.deposit && v.deposit.terms ? '\n\n' + v.deposit.terms : ''}\n\nLook up or cancel: ${manage}\n\nSee you soon,\n${c.salonName}`,
      salon: `New ${v.kind === 'combo' ? 'stacked' : 'family'} booking: ${short}. Holder ${v.holder.name} (${v.holder.phone}${v.holder.email ? ', ' + v.holder.email : ''}). ${lines.join('; ')}. Code ${v.code}${v.notes ? '. Notes: ' + v.notes : ''}`
    },
    cancelled: {
      sms:   `${c.salonName}: your visit (${short}) has been cancelled. Code ${v.code}.${cancelDeposit(v)} Rebook: ${c.siteUrl}/book`,
      subject: `Visit cancelled — ${c.salonName}`,
      email: `Hi ${v.holder.name},\n\nYour visit has been cancelled:\n\n${lines.join('\n')}\n\nCode ${v.code}\n\nRebook any time: ${c.siteUrl}/book\n\n${c.salonName}`,
      salon: `Cancelled ${v.kind === 'combo' ? 'stacked' : 'family'} visit: ${short}. Holder ${v.holder.name} (${v.holder.phone}). Code ${v.code}`
    },
    reminder: {
      sms:   `${c.salonName} reminder: ${lines.join('; ')}. Code ${v.code}. Need to change it? ${manage}`,
      subject: `Reminder: your visit tomorrow — ${c.salonName}`,
      email: `Hi ${v.holder.name},\n\nA reminder of your visit:\n\n${lines.join('\n')}\n\nCode ${v.code}\n\nNeed to change it? ${manage}\n\n${c.salonName}`
    }
  };
}
async function sendFamily(kind, v, tz, { salon = true } = {}) {
  const t = familyTemplates(v, tz)[kind];
  const c = config();
  const jobs = [
    sendSms({ to: v.holder.phone, body: t.sms }),
    sendEmail({ to: v.holder.email, subject: t.subject, text: t.email })
  ];
  if (salon && t.salon) {
    jobs.push(sendSms({ to: c.salonSms, body: t.salon }));
    jobs.push(sendEmail({ to: c.salonEmail, subject: t.salon.slice(0, 80), text: t.salon }));
  }
  const results = await Promise.allSettled(jobs);
  return results.map(r => r.status === 'fulfilled' ? r.value : { error: String(r.reason) });
}
const familyBooked    = (v, tz) => sendFamily('booked', v, tz);
const familyCancelled = (v, tz) => sendFamily('cancelled', v, tz);
const familyReminder  = (v, tz) => sendFamily('reminder', v, tz, { salon: false });

const booked    = (a, tz) => send('booked', a, tz);
const cancelled = (a, tz) => send('cancelled', a, tz);
const reminder  = (a, tz) => send('reminder', a, tz, { salon: false });
const moved     = (a, tz) => send('moved', a, tz, { salon: false });

// Never let a notification failure surface to the caller.
const safely = (p) => p.catch(e => [{ error: String(e) }]);

module.exports = { booked, cancelled, reminder, moved, familyBooked, familyCancelled, familyReminder, familyTemplates, safely, outbox, sendEmail, sendSms, templates };
