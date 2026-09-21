// GET /api/book/services → catalog grouped by category
const { listServices } = require('../../lib/booking');
const { getSettings } = require('../../lib/db');
const bookingMode = require('../../lib/booking-mode');
const { fail } = require('./_shared');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    res.setHeader('Cache-Control', 'public, max-age=60');
    // While the salon books on Square, the page needs only the hand-off —
    // and must work before the database exists.
    if (!bookingMode.open()) {
      const slug = String(req.query.service || '');
      return res.status(200).json({ bookingOpen: false, squareUrl: bookingMode.squareUrl(slug), categories: [] });
    }
    const [categories, settings] = await Promise.all([listServices(), getSettings()]);
    res.status(200).json({
      bookingOpen: true,
      categories,
      timeZone: settings.time_zone,
      maxDaysAhead: settings.max_days_ahead
    });
  } catch (e) { fail(res, e); }
};
