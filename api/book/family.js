// Family bookings: several people in one visit, one confirmation code.
//   GET  /api/book/family?date=YYYY-MM-DD&people=<json>
//        people = [{ name, service, variation, stylist }]  (stylist optional)
//        → { date, windowMin, options: [{ startAt, people: [{ name, stylist, startAt, … }] }] }
//   POST /api/book/family
//        { holder:{name,phone,email}, people:[{ name, relationship, service, variation, stylist, startAt }], notes }
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
      return res.status(200).json(await family.availability({ people, date: req.query.date }));
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      return res.status(201).json(await family.create({ holder: b.holder, people: b.people, notes: b.notes, themeAck: Boolean(b.themeAck) }));
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { fail(res, e); }
};
