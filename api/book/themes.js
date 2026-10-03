// GET /api/book/themes            → the themed days a client can book, for the calendar
// GET /api/book/themes?date=YYYY-MM-DD → the theme for one day (the TV asks for today)
const themes = require('../../lib/themes');
const { fail, noStore } = require('./_shared');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    noStore(res);
    if (req.query.date) {
      const t = await themes.forDate(String(req.query.date));
      return res.status(200).json({ date: req.query.date, theme: t && { id: t.id, name: t.name, audience: t.audience, headline: t.headline, body: t.body, tvBody: t.tvBody } });
    }
    res.status(200).json(await themes.calendar());
  } catch (e) { fail(res, e); }
};
