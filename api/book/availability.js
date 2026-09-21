// GET /api/book/availability?service=<slug>&date=YYYY-MM-DD[&variation=<id>][&stylist=<slug>]
// `variation` may be omitted only for a service with a single bookable option.
const { availability } = require('../../lib/booking');
const { fail, noStore } = require('./_shared');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    noStore(res);
    const { service, date, stylist, variation } = req.query;
    if (!service || !date) return res.status(400).json({ error: 'service and date are required' });
    res.status(200).json(await availability({
      serviceSlug: service, variationId: variation || null, date, stylistSlug: stylist || null
    }));
  } catch (e) { fail(res, e); }
};
