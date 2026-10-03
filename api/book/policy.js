// GET /api/book/policy?services=slug,slug… → the deposit and terms a client
// accepts before booking those services (consultations hold nothing).
const { getSettings } = require('../../lib/db');
const policy = require('../../lib/policy');
const booking = require('../../lib/booking');
const { fail, noStore } = require('./_shared');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    noStore(res);
    const settings = await getSettings();
    const slugs = String(req.query.services || '').split(',').map(x => x.trim()).filter(Boolean);
    let deposit = 0;
    for (const slug of slugs) {
      const svc = await booking._internal.getService(slug);
      deposit += booking._internal.depositForService(svc, settings);
    }
    res.status(200).json({ deposit_cents: deposit, terms: policy.terms(settings, deposit), cancelWindowHours: Number(settings.cancel_window_hours) || 0 });
  } catch (e) { fail(res, e); }
};
