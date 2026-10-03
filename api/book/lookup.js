// GET  /api/book/lookup?code=CH-XXXXX → appointment details (CF-XXXXX → the whole family visit)
// POST /api/book/lookup { code, action: 'cancel' } → cancel it (a visit code cancels every leg)
const booking = require('../../lib/booking');
const family = require('../../lib/family');
const { fail, noStore } = require('./_shared');

module.exports = async (req, res) => {
  try {
    noStore(res);
    if (req.method === 'GET') {
      const code = req.query.code;
      if (family.isVisitCode(code)) { const v = await family.lookup(code); return res.status(200).json({ ...v, kind: 'visit', visitKind: v.kind }); }
      return res.status(200).json(await booking.lookup(code));
    }
    if (req.method === 'POST' && (req.body || {}).action === 'cancel') {
      const code = req.body.code;
      return res.status(200).json(family.isVisitCode(code) ? await family.cancel(code) : await booking.cancel(code));
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { fail(res, e); }
};
