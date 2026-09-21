// Shared plumbing for the booking routes. Files under api/ that start with an
// underscore are not exposed as endpoints by Vercel.
const { httpError } = require('../../lib/db');
const { BookingError } = require('../../lib/booking');

function fail(res, e) {
  if (e instanceof BookingError) return res.status(e.status).json({ error: e.message });
  const { status, error } = httpError(e);
  return res.status(status).json({ error });
}

const noStore = (res) => res.setHeader('Cache-Control', 'no-store');

function isAdmin(req) {
  const key = process.env.ADMIN_PASSWORD;
  return Boolean(key) && req.headers['x-admin-key'] === key;
}

module.exports = { fail, noStore, isAdmin };
