// Booking mode: Square until switch-over, then the site. No database needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const mode = require('../lib/booking-mode');
const links = require('../lib/square-links.json');
const { services } = require('../lib/seed-data.json');

const req = (method, { query = {}, body } = {}) => ({ method, query, body, headers: {} });
const res = () => ({ statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; } });
const call = async (h, r) => { const s = res(); await h(r, s); return s; };

test('defaults to Square; only BOOKING_MODE=site opens booking here', () => {
  delete process.env.BOOKING_MODE;
  assert.equal(mode.mode(), 'square'); assert.equal(mode.open(), false);
  process.env.BOOKING_MODE = 'site'; assert.equal(mode.open(), true);
  process.env.BOOKING_MODE = 'anything-else'; assert.equal(mode.open(), false);
  delete process.env.BOOKING_MODE;
});

test('Square deep links: every mapped service exists in the catalog; unknown falls back to the general page', () => {
  const slugs = new Set(services.map(s => s.slug));
  assert.ok(Object.keys(links.services).length >= 20);
  for (const slug of Object.keys(links.services)) assert.ok(slugs.has(slug), slug);
  assert.match(mode.squareUrl('loc-retwist'), /book\.squareup\.com.*\/services\//);
  assert.equal(mode.squareUrl('no-such-service'), links.base);
  assert.equal(mode.squareUrl(), links.base);
  process.env.SQUARE_BOOKING_URL = 'https://example.com/book';
  assert.equal(mode.squareUrl('no-such-service'), 'https://example.com/book');
  delete process.env.SQUARE_BOOKING_URL;
});

test('in Square mode the API hands off and refuses to book, without touching the database', async () => {
  delete process.env.BOOKING_MODE;
  delete process.env.DATABASE_URL;
  for (const k of Object.keys(require.cache)) if (/\/lib\/|\/api\/book\//.test(k)) delete require.cache[k];
  const services = require('../api/book/services');
  const create = require('../api/book/create');
  const s = await call(services, req('GET', { query: { service: 'loc-retwist' } }));
  assert.equal(s.statusCode, 200); assert.equal(s.body.bookingOpen, false);
  assert.match(s.body.squareUrl, /\/services\//);
  const c = await call(create, req('POST', { body: { service: 'loc-retwist' } }));
  assert.equal(c.statusCode, 503); assert.match(c.body.error, /Square/); assert.ok(c.body.squareUrl);
  for (const k of Object.keys(require.cache)) if (/\/lib\/|\/api\/book\//.test(k)) delete require.cache[k];
});
