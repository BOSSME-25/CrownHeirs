// POST /api/book/create
// { service, stylist ('any' or slug), startAt (ISO), client:{name,phone,email}, notes }
const { createAppointment } = require('../../lib/booking');
const { fail, noStore } = require('./_shared');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    noStore(res);
    const b = req.body || {};
    const appt = await createAppointment({
      serviceSlug: b.service, stylistSlug: b.stylist || 'any',
      startAt: b.startAt, client: b.client, notes: b.notes
    });
    res.status(201).json(appt);
  } catch (e) { fail(res, e); }
};
