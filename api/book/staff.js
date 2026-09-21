// Staff endpoint (admin password required). One route, dispatched by `action`,
// so the front desk page talks to a single URL.
//   GET  ?action=day&date=YYYY-MM-DD
//   GET  ?action=stylists
//   GET  ?action=availability&service=&variation=&date=[&stylist=]   (no lead time)
//   POST { action: 'book', ...same as /api/book/create }               (no lead time; source=staff)
//   POST { action: 'status', code, status }
//   POST { action: 'timeoff.add', stylist, startsAt, endsAt, reason }
//   POST { action: 'timeoff.remove', id }
//   POST { action: 'stylist.save', slug?, name, title, active, hours, services, email, hoursSource }
//   GET  ?action=hub.status                       Team Hub connection check
//   POST { action: 'hub.resync', from, to }       re-push a date range to Team Hub
const staff = require('../../lib/staff');
const { availability, createAppointment } = require('../../lib/booking');
const { fail, noStore, isAdmin } = require('./_shared');

module.exports = async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Not authorized' });
  try {
    noStore(res);
    if (req.method === 'GET') {
      const q = req.query;
      switch (q.action) {
        case 'day':          return res.status(200).json(await staff.day(q.date));
        case 'stylists':     return res.status(200).json({ stylists: await staff.listStylists() });
        case 'hub.status':   return res.status(200).json(await staff.hubStatus());
        case 'availability': return res.status(200).json(await availability({
          serviceSlug: q.service, variationId: q.variation || null, date: q.date, stylistSlug: q.stylist || null, staff: true
        }));
        default: return res.status(400).json({ error: 'Unknown action' });
      }
    }
    if (req.method === 'POST') {
      const b = req.body || {};
      switch (b.action) {
        case 'book': return res.status(201).json(await createAppointment({
          serviceSlug: b.service, variationId: b.variation ?? null, stylistSlug: b.stylist || 'any',
          startAt: b.startAt, client: b.client, notes: b.notes, staff: true
        }));
        case 'status':         return res.status(200).json(await staff.setStatus(b.code, b.status));
        case 'timeoff.add':    return res.status(201).json(await staff.addTimeOff(b));
        case 'timeoff.remove': return res.status(200).json(await staff.removeTimeOff(b.id));
        case 'stylist.save':   return res.status(200).json(await staff.saveStylist(b));
        case 'hub.resync':     return res.status(200).json(await staff.hubResync(b));
        default: return res.status(400).json({ error: 'Unknown action' });
      }
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { fail(res, e); }
};
