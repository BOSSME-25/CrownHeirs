// GET  /api/book/setup → row counts (admin)
// POST /api/book/setup → create tables + load the starting catalog (admin)
// Lets the database be initialised from the /admin page — no terminal needed.
const { migrate, seed, status } = require('../../lib/setup');
const { fail, noStore, isAdmin } = require('./_shared');

module.exports = async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Not authorized' });
  try {
    noStore(res);
    if (req.method === 'GET') return res.status(200).json(await status());
    if (req.method === 'POST') {
      await migrate();
      const report = await seed();
      return res.status(200).json({ ok: true, ...report, ...(await status()) });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { fail(res, e); }
};
