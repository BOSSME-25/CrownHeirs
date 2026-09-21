// GET /api/book/services → catalog grouped by category
const { listServices } = require('../../lib/booking');
const { getSettings } = require('../../lib/db');
const { fail } = require('./_shared');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    res.setHeader('Cache-Control', 'public, max-age=60');
    const [categories, settings] = await Promise.all([listServices(), getSettings()]);
    res.status(200).json({
      categories,
      timeZone: settings.time_zone,
      maxDaysAhead: settings.max_days_ahead
    });
  } catch (e) { fail(res, e); }
};
