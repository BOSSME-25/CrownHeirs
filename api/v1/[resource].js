// Read API for integrations (Team Hub). Bearer token with named scopes.
//   GET /api/v1/whoami
//   GET /api/v1/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD[&status=]   appointments:read
//   GET /api/v1/tickets?from&to[&status=]                               tickets:read
//   GET /api/v1/catalog                                                 catalog:read
//   GET /api/v1/schedule?from&to                                        schedule:read
//   GET /api/v1/employees                                               employees:read
// Date ranges are salon-local days, any length up to 366 days, any distance
// back — no rolling horizon. Money is integer cents with a _cents suffix.
const tokens = require('../../lib/api-tokens');
const { query, getSettings, httpError } = require('../../lib/db');
const { listServices, BookingError } = require('../../lib/booking');
const tickets = require('../../lib/tickets');
const staff = require('../../lib/staff');
const { localToUtc, addDays, utcToLocal } = require('../../lib/tz');

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const NEEDS = { appointments: 'appointments:read', tickets: 'tickets:read', catalog: 'catalog:read', schedule: 'schedule:read', employees: 'employees:read' };

function range(q, settings) {
  const { from, to } = q;
  if (!YMD.test(from || '') || !YMD.test(to || '')) throw new BookingError(400, 'from and to are required, YYYY-MM-DD');
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  if (days < 0 || days > 366) throw new BookingError(400, 'Range must be 0–366 days, from ≤ to');
  return { from, to, a: localToUtc(from, 0, settings.time_zone), b: localToUtc(addDays(to, 1), 0, settings.time_zone) };
}

async function appointments(q, settings) {
  const r = range(q, settings);
  const { rows } = await query(
    `SELECT a.code, a.status, a.source, a.starts_at, a.ends_at, a.variation_name, a.notes, a.created_at,
            s.slug AS service_slug, s.name AS service_name, s.category, v.id AS variation_id, v.duration_min,
            st.id AS stylist_id, st.slug AS stylist_slug, st.name AS stylist_name, st.email AS stylist_email,
            c.id AS client_id, c.name AS client_name, c.phone AS client_phone,
            t.code AS ticket_code
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       LEFT JOIN service_variations v ON v.id = a.variation_id
       JOIN stylists st ON st.id = a.stylist_id
       JOIN clients c ON c.id = a.client_id
       LEFT JOIN tickets t ON t.appointment_id = a.id AND t.status <> 'voided'
      WHERE a.starts_at >= $1 AND a.starts_at < $2 ${q.status ? 'AND a.status = $3' : ''}
      ORDER BY a.starts_at`, q.status ? [r.a, r.b, q.status] : [r.a, r.b]);
  return { from: r.from, to: r.to, timezone: settings.time_zone, appointments: rows.map(x => ({
    id: x.code, status: x.status, source: x.source, start_at: x.starts_at, end_at: x.ends_at, created_at: x.created_at,
    // One segment per booking today; the array is the contract's shape.
    segments: [{ employee_id: x.stylist_id, employee: { slug: x.stylist_slug, name: x.stylist_name, email: x.stylist_email },
                 service: { slug: x.service_slug, name: x.service_name, category: x.category, variation_id: x.variation_id, variation: x.variation_name || null },
                 duration_min: x.duration_min || Math.round((new Date(x.ends_at) - new Date(x.starts_at)) / 60000) }],
    client: { id: x.client_id, name: x.client_name, phone: x.client_phone },
    ticket_id: x.ticket_code || null, notes: x.notes
  })) };
}

async function ticketsRange(q, settings) {
  const r = range(q, settings);
  const list = await tickets.listRange({ from: r.from, to: r.to, status: q.status || null, limit: 2000 });
  return { from: r.from, to: r.to, timezone: settings.time_zone, tickets: list.map(t => ({
    id: t.code, status: t.status, opened_at: t.openedAt, paid_at: t.paidAt, voided_at: t.voidedAt,
    appointment_id: t.appointment?.code || null, client_id: t.client?.id || null, client: t.client ? { name: t.client.name, phone: t.client.phone } : null,
    rung_by: t.rungBy?.slug || null, tender: t.tender, tender_ref: t.tenderRef,
    subtotal_cents: t.subtotal_cents, discount_cents: t.discount_cents, tax_cents: t.tax_cents, total_cents: t.total_cents,
    tip_cents: t.tip_cents, refunded_cents: t.refunded_cents, refunds: t.refunds,
    lines: t.lines.map(l => ({ id: l.id, kind: l.kind, name: l.name, quantity: l.quantity,
      employee_id: l.provider.id, employee: { slug: l.provider.slug, name: l.provider.name },
      service: l.service, retail_item_id: l.retailItemId,
      gross_cents: l.gross_cents, discount_cents: l.discount_cents, discount_reason: l.discount_reason, tax_cents: l.tax_cents, net_cents: l.net_cents }))
  })) };
}

async function catalog() {
  const [cats, retail] = await Promise.all([listServices(), tickets.listRetail()]);
  return {
    services: cats.flatMap(c => c.services.map(s => ({ slug: s.slug, name: s.name, category: c.category, product_type: 'service',
      price_from_cents: s.price_from_cents, variations: s.variations.map(v => ({ id: v.id, name: v.name, duration_min: v.duration_min })) }))),
    retail: retail.filter(r => r.active).map(r => ({ id: r.id, sku: r.sku, name: r.name, product_type: 'retail', price_cents: r.price_cents, taxable: r.taxable }))
  };
}

async function schedule(q, settings) {
  const r = range(q, settings);
  const roster = await staff.listStylists();
  const { rows: off } = await query('SELECT stylist_id, starts_at, ends_at, reason FROM time_off WHERE starts_at < $2 AND ends_at > $1', [r.a, r.b]);
  const entries = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) {
    const wd = new Date(Date.UTC(...d.split('-').map((n, i) => i === 1 ? n - 1 : +n))).getUTCDay();
    for (const s of roster) {
      if (!s.active) continue;
      for (const h of s.hours.filter(h => h.weekday === wd)) {
        entries.push({ employee: { slug: s.slug, name: s.name, email: s.email || null }, date: d, start_min: h.startMin, end_min: h.endMin, type: 'shift', hours_source: s.hoursSource });
      }
    }
  }
  const byId = Object.fromEntries((await query('SELECT id, slug FROM stylists')).rows.map(x => [x.id, x.slug]));
  for (const o of off) entries.push({ employee: { slug: byId[o.stylist_id] }, start_at: o.starts_at, end_at: o.ends_at, reason: o.reason, type: 'time_off' });
  return { from: r.from, to: r.to, timezone: settings.time_zone, entries };
}

async function employees() {
  const { rows } = await query('SELECT id, slug, name, title, email, active, hours_source FROM stylists ORDER BY sort, name');
  return { employees: rows.map(r => ({ id: r.id, slug: r.slug, name: r.name, title: r.title, email: r.email, active: r.active, hours_source: r.hours_source })) };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = req.headers.authorization || '';
  const tok = await tokens.verify(auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '').catch(() => null);
  if (!tok) return res.status(401).json({ error: 'Missing or invalid token' });
  const resource = String(req.query.resource || '');
  try {
    if (resource === 'whoami') return res.status(200).json({ name: tok.name, scopes: tok.scopes });
    const need = NEEDS[resource];
    if (!need) return res.status(404).json({ error: 'Unknown resource' });
    if (!tok.scopes.includes(need)) return res.status(403).json({ error: `Token lacks scope ${need}`, scopes: tok.scopes });
    const settings = await getSettings();
    const out = resource === 'appointments' ? await appointments(req.query, settings)
      : resource === 'tickets' ? await ticketsRange(req.query, settings)
      : resource === 'catalog' ? await catalog()
      : resource === 'schedule' ? await schedule(req.query, settings)
      : await employees();
    res.status(200).json(out);
  } catch (e) {
    if (e instanceof BookingError) return res.status(e.status).json({ error: e.message });
    const { status, error } = httpError(e); res.status(status).json({ error });
  }
};
