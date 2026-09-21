// Where bookings actually happen right now.
//   BOOKING_MODE=square  (default) — the salon still books on Square; /book
//                        sends customers there, to the specific service when
//                        a deep link is known. Nothing is booked here.
//   BOOKING_MODE=site    — switch-over: bookings are taken here.
// Defaulting to Square is deliberate: making the site public for the TV must
// not silently open a second booking system.
const links = require('./square-links.json');

function mode() { return process.env.BOOKING_MODE === 'site' ? 'site' : 'square'; }
const open = () => mode() === 'site';

function squareUrl(serviceSlug) {
  const base = process.env.SQUARE_BOOKING_URL || links.base;
  return (serviceSlug && links.services[serviceSlug]) || base;
}

module.exports = { mode, open, squareUrl };
