// POST /api/book/create
// { service, variation (id; optional for single-option services), stylist ('any' or slug),
//   startAt (ISO), client:{name,phone,email}, notes }
const { createAppointment } = require('../../lib/booking');
const bookingMode = require('../../lib/booking-mode');
const { fail, noStore } = require('./_shared');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    noStore(res);
    const b = req.body || {};
    if (!bookingMode.open()) {
      return res.status(503).json({ error: 'Online booking here isn\'t open yet — please book on Square.', squareUrl: bookingMode.squareUrl(b.service) });
    }
    const appt = await createAppointment({
      serviceSlug: b.service, variationId: b.variation ?? null, stylistSlug: b.stylist || 'any',
      startAt: b.startAt, client: b.client, notes: b.notes
    });
    res.status(201).json(appt);
  } catch (e) { fail(res, e); }
};
