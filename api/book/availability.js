// GET /api/book/availability?service=<slug>&date=YYYY-MM-DD[&stylist=<slug>]
const { availability } = require('../../lib/booking');
const { fail, noStore } = require('./_shared');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    noStore(res);
    const { service, date, stylist } = req.query;
    if (!service || !date) return res.status(400).json({ error: 'service and date are required' });
    res.status(200).json(await availability({ serviceSlug: service, date, stylistSlug: stylist || null }));
  } catch (e) { fail(res, e); }
};
