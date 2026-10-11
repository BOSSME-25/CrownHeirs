// Crown Heirs Doll Maker.
//   GET  /api/dolls            → the choices (bases, complexions, hair, tops, bottoms, shoes, accessories, reveals)
//   GET  /api/dolls?code=DL-…  → one request's status (the client's own code)
//   POST /api/dolls            → { name, phone, email?, base, shade, hairColor, hairColor2?, hairStyle,
//                                  top, topColor?, bottom, bottomColor?, shoes, shoesColor?, accessories?: [],
//                                  look?, quantity?, notes?, forWhom? }
const dolls = require('../lib/dolls');
const { fail, noStore } = require('./book/_shared');

module.exports = async (req, res) => {
  try {
    noStore(res);
    if (req.method === 'GET') {
      if (req.query.code) return res.status(200).json(await dolls.lookup(req.query.code));
      return res.status(200).json(dolls.options());
    }
    if (req.method === 'POST') return res.status(201).json(await dolls.create(req.body || {}));
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { fail(res, e); }
};
