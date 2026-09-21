// Daily reminder run. Triggered by the Vercel cron in vercel.json, which sends
// `Authorization: Bearer $CRON_SECRET`; the admin key also works for a manual
// run from /staff.
const { sendReminders } = require('../../lib/staff');
const { fail, noStore, isAdmin } = require('./_shared');

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const fromCron = secret && req.headers.authorization === `Bearer ${secret}`;
  if (!fromCron && !isAdmin(req)) {
    return res.status(401).json({ error: secret ? 'Not authorized' : 'Set CRON_SECRET in Vercel to enable scheduled reminders' });
  }
  try {
    noStore(res);
    const hours = Math.min(Math.max(Number(req.query.hours) || 36, 1), 72);
    res.status(200).json(await sendReminders({ hours }));
  } catch (e) { fail(res, e); }
};
