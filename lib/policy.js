// Deposits, cancellation and lateness: the rules, in one place.
//
// Deposit: a percentage of the service's starting price (deposit_percent),
// never less than deposit_min_cents when the service has a price at all; a
// service can override with its own deposit_cents. A consultation or an
// unpriced service takes no deposit. Cancelling inside cancel_window_hours
// forfeits the deposit; a client with fee_waived (a Loyalty member) never
// forfeits. A no-show forfeits. After late_grace_min the desk may mark a
// no-show. The client accepts this at booking (policy_ack).
const { getSettings } = require('./db');

const money = c => '$' + (Math.round(c) / 100).toFixed(c % 100 ? 2 : 0);

function depositFor(service, settings) {
  if (!service) return 0;
  if (service.deposit_cents != null) return service.deposit_cents;
  const price = service.price_from_cents;
  if (price == null || price <= 0) return 0;
  const pct = Number(settings.deposit_percent) || 0;
  if (pct <= 0) return 0;
  const raw = Math.round(price * pct / 100 / 100) * 100;      // whole dollars
  return Math.min(price, Math.max(raw, Number(settings.deposit_min_cents) || 0));
}

// The policy as a client reads it before they tick the box.
function terms(settings, depositCents) {
  const bits = [];
  if (depositCents > 0) bits.push(`A deposit of ${money(depositCents)} holds your appointment and comes off your total.`);
  const h = Number(settings.cancel_window_hours) || 0;
  if (h > 0) bits.push(depositCents > 0
    ? `Cancel or move it at least ${h} hours ahead and the deposit carries over. Inside ${h} hours, or if you don't show, the deposit is forfeited.`
    : `Please cancel or move your appointment at least ${h} hours ahead.`);
  const g = Number(settings.late_grace_min) || 0;
  if (g > 0) bits.push(`Arrive within ${g} minutes of your time; after that we may have to treat it as a no-show.`);
  if (settings.policy_text) bits.push(String(settings.policy_text));
  return bits.join(' ');
}

// Would cancelling `startsAt` at `now` be inside the window?
function isLateCancel(startsAt, settings, now = new Date()) {
  const h = Number(settings.cancel_window_hours) || 0;
  return h > 0 && new Date(startsAt).getTime() - now.getTime() < h * 3600 * 1000;
}

// Is a confirmed appointment past its grace period with nobody in the chair?
function isLate(startsAt, settings, now = new Date()) {
  const g = Number(settings.late_grace_min) || 0;
  return now.getTime() > new Date(startsAt).getTime() + g * 60000;
}

// What happens to a deposit on cancellation.
function cancelOutcome({ depositStatus, startsAt, feeWaived }, settings, now = new Date()) {
  const late = isLateCancel(startsAt, settings, now);
  if (depositStatus !== 'paid') return { late, deposit: depositStatus === 'due' ? 'none' : depositStatus, forfeited: false };
  if (late && !feeWaived) return { late, deposit: 'forfeited', forfeited: true };
  return { late, deposit: 'paid', forfeited: false };   // paid and on time (or waived): stays on account, carried to the rebooking by the desk
}

async function current() { return getSettings(); }

module.exports = { depositFor, terms, isLateCancel, isLate, cancelOutcome, current, money };
