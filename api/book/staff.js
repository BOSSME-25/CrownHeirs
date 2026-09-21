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
const tickets = require('../../lib/tickets');
const tokens = require('../../lib/api-tokens');
const { availability, createAppointment } = require('../../lib/booking');
const { query, getSettings } = require('../../lib/db');
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
        case 'tickets.day':  return res.status(200).json({ tickets: await tickets.listDay(q.date) });
        case 'ticket.get':   return res.status(200).json(await tickets.get(q.code));
        case 'retail.list':  return res.status(200).json({ items: await tickets.listRetail(), tax_rate_bps: Number((await getSettings()).tax_rate_bps) || 0 });
        case 'tokens.list':  return res.status(200).json({ tokens: await tokens.list(), scopes: tokens.SCOPES });
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
        // ── tickets ──
        case 'ticket.open':    return res.status(201).json(await tickets.open(b));
        case 'ticket.line.add':    return res.status(200).json(await tickets.addLine(b.code, b.line || {}));
        case 'ticket.line.update': return res.status(200).json(await tickets.updateLine(b.code, b.lineId, b.patch || {}));
        case 'ticket.line.remove': return res.status(200).json(await tickets.removeLine(b.code, b.lineId));
        case 'ticket.pay':     return res.status(200).json(await tickets.pay(b.code, b));
        case 'ticket.void':    return res.status(200).json(await tickets.voidTicket(b.code, b.reason));
        case 'ticket.refund':  return res.status(200).json(await tickets.refund(b.code, b));
        case 'retail.save':    return res.status(200).json(await tickets.saveRetail(b));
        case 'settings.save': {
          const bps = Math.round(Number(b.tax_rate_percent) * 100);
          if (!(bps >= 0 && bps <= 3000)) return res.status(400).json({ error: 'Tax rate must be between 0 and 30 percent' });
          await query(`INSERT INTO settings (key, value) VALUES ('tax_rate_bps', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [String(bps)]);
          return res.status(200).json({ ok: true, tax_rate_bps: bps });
        }
        case 'token.create':   return res.status(201).json(await tokens.create(b));
        case 'token.revoke':   return res.status(200).json(await tokens.revoke(b.id));
        default: return res.status(400).json({ error: 'Unknown action' });
      }
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { fail(res, e); }
};
