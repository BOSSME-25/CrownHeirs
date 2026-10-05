// GET /api/instagram → { posts: [...], source: 'instagram' | 'none', categories: [...] }
// The salon's latest Instagram posts for the home page, sorted into the
// service categories. Public; cached ten minutes per instance and at the edge.
const ig = require('../lib/instagram');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const limit = Math.min(48, Math.max(1, Number(req.query.limit) || 24));
  const out = await ig.feed({ limit, force: req.query.fresh === '1' });
  res.setHeader('Cache-Control', out.source === 'instagram' ? 'public, s-maxage=600, stale-while-revalidate=3600' : 'no-store');
  res.status(200).json({ ...out, categories: ig.CATEGORIES, configured: ig.configured() });
};
