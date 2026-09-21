// GET  /api/book/lookup?code=CH-XXXXX → appointment details
// POST /api/book/lookup { code, action: 'cancel' } → cancel it
const { lookup, cancel } = require('../../lib/booking');
const { fail, noStore } = require('./_shared');

module.exports = async (req, res) => {
  try {
    noStore(res);
    if (req.method === 'GET') return res.status(200).json(await lookup(req.query.code));
    if (req.method === 'POST' && (req.body || {}).action === 'cancel') {
      return res.status(200).json(await cancel(req.body.code));
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { fail(res, e); }
};
