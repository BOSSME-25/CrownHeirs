// Daily referral sync with Square. Triggered by the Vercel cron in vercel.json
// (`Authorization: Bearer $CRON_SECRET`); the admin key also works. Settings →
// "Sync with Square now" does the same through /api/book/staff.
// Reads the "Referred by" field of customers with a completed Square payment
// since the last run and connects their referrals (lib/referrals.js).
const referrals = require('../../lib/referrals');
const square = require('../../lib/square');
const { getSettings } = require('../../lib/db');
const { fail, noStore, isAdmin } = require('./_shared');

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const fromCron = secret && req.headers.authorization === `Bearer ${secret}`;
  if (!fromCron && !isAdmin(req)) {
    return res.status(401).json({ error: secret ? 'Not authorized' : 'Set CRON_SECRET in Vercel to enable the scheduled referral sync' });
  }
  try {
    noStore(res);
    if (!square.configured()) return res.status(200).json({ skipped: 'Square is not connected' });
    let fields = {};
    try { fields = JSON.parse((await getSettings()).referrals_square_keys || '{}'); } catch { fields = {}; }
    if (!fields.referredBy) return res.status(200).json({ skipped: 'Referrals are not set up in Square yet (Settings → Referrals & Crown Jewels)' });
    res.status(200).json(await referrals.syncSquare());
  } catch (e) { fail(res, e); }
};
