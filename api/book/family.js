// Visits: several appointments booked together, one confirmation code.
// A family (several people), a stack (one person, several services), or both.
//
//   GET  /api/book/family?date=YYYY-MM-DD&people=<json>[&mode=together|sameday]
//        people = [{ name, self?, relationship?, services: [{ service, variation, stylist? }] }]
//        → { date, mode, windowMin, options: [{ startAt, endsAt, people: [{ name, legs: [...] }] }] }
//   GET  /api/book/family?soonest=1&people=<json>[&mode=…][&from=YYYY-MM-DD]
//        → { date, mode, option }   the first day with a fit, or date: null
//   POST /api/book/family
//        { holder:{name,phone,email}, people:[{ name, self?, services:[{ service, variation, stylist, startAt }] }], mode, notes, themeAck }
//        → the visit (code CF-XXXXX) with every leg
const family = require('../../lib/family');
const bookingMode = require('../../lib/booking-mode');
const { fail, noStore } = require('./_shared');

module.exports = async (req, res) => {
  try {
    noStore(res);
    if (!bookingMode.open()) {
      return res.status(503).json({ error: 'Online booking here isn\'t open yet — please book on Square.', squareUrl: bookingMode.squareUrl() });
    }
    if (req.method === 'GET') {
      let people;
      try { people = JSON.parse(req.query.people || '[]'); } catch (e) { return res.status(400).json({ error: 'people must be JSON' }); }
      const mode = req.query.mode || 'together';
      if (req.query.soonest) return res.status(200).json(await family.soonest({ people, mode, from: req.query.from || null }));
      return res.status(200).json(await family.availability({ people, date: req.query.date, mode }));
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      return res.status(201).json(await family.create({ holder: b.holder, people: b.people, notes: b.notes, mode: b.mode || 'together', themeAck: Boolean(b.themeAck) }));
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { fail(res, e); }
};
