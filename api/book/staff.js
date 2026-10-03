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
//   GET  ?action=hub.hours&email=                 a stylist's weekly hours as Team Hub publishes them
//   POST { action: 'hub.resync', from, to }       re-push a date range to Team Hub
//   POST { action: 'move', code, startAt, stylist?, reason? }  reschedule (client notified)
//   GET  ?action=themes.list / POST { action: 'theme.save', …theme } / { action: 'theme.remove', id }
const staff = require('../../lib/staff');
const { BookingError } = require('../../lib/booking');
const themes = require('../../lib/themes');
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
        case 'themes.list':  return res.status(200).json({ themes: await themes.list() });
        case 'hub.hours':    return res.status(200).json(await staff.hubHours({ email: q.email }));
        case 'tickets.day':  return res.status(200).json({ tickets: await tickets.listDay(q.date) });
        case 'ticket.get':   return res.status(200).json(await tickets.get(q.code));
        case 'retail.list':  return res.status(200).json({ items: await tickets.listRetail(), tax_rate_bps: Number((await getSettings()).tax_rate_bps) || 0 });
        case 'policy':       { const st = await getSettings(); return res.status(200).json({ deposit_percent: Number(st.deposit_percent) || 0, deposit_min_cents: Number(st.deposit_min_cents) || 0, cancel_window_hours: Number(st.cancel_window_hours) || 0, late_grace_min: Number(st.late_grace_min) || 0, policy_text: st.policy_text || '', square: require('../../lib/square').configured() }); }
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
        case 'move':           return res.status(200).json(await staff.move(b.code, b));
        case 'theme.save':     return res.status(200).json(await themes.save(b.theme || b));
        case 'theme.remove':   return res.status(200).json(await themes.remove(b.id));
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
          const put = (k, v) => query(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [k, String(v)]);
          const out = { ok: true };
          if (b.tax_rate_percent !== undefined) {
            const bps = Math.round(Number(b.tax_rate_percent) * 100);
            if (!(bps >= 0 && bps <= 3000)) return res.status(400).json({ error: 'Tax rate must be between 0 and 30 percent' });
            await put('tax_rate_bps', bps); out.tax_rate_bps = bps;
          }
          const num = (k, lo, hi, label) => { if (b[k] === undefined) return null; const n = Number(b[k]); if (!(n >= lo && n <= hi)) throw new BookingError(400, `${label} must be between ${lo} and ${hi}`); return n; };
          const pct = num('deposit_percent', 0, 100, 'Deposit percent'); if (pct !== null) { await put('deposit_percent', pct); out.deposit_percent = pct; }
          const min = num('deposit_min_dollars', 0, 1000, 'Minimum deposit'); if (min !== null) { await put('deposit_min_cents', Math.round(min * 100)); out.deposit_min_cents = Math.round(min * 100); }
          const win = num('cancel_window_hours', 0, 240, 'Cancellation window'); if (win !== null) { await put('cancel_window_hours', win); out.cancel_window_hours = win; }
          const grace = num('late_grace_min', 0, 120, 'Late grace'); if (grace !== null) { await put('late_grace_min', grace); out.late_grace_min = grace; }
          if (b.policy_text !== undefined) { await put('policy_text', String(b.policy_text).slice(0, 600)); out.policy_text = String(b.policy_text).slice(0, 600); }
          return res.status(200).json(out);
        }
        case 'deposit.mark':   return res.status(200).json(await staff.markDeposit(b.code, b));
        case 'client.waive':   return res.status(200).json(await staff.waiveFees(b.phone, b.waived));
        case 'token.create':   return res.status(201).json(await tokens.create(b));
        case 'token.revoke':   return res.status(200).json(await tokens.revoke(b.id));
        default: return res.status(400).json({ error: 'Unknown action' });
      }
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) { fail(res, e); }
};
