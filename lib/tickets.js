// Tickets: the revenue record the hub reads. See schema.sql for the shape.
const crypto = require('crypto');
const { query, withTransaction, getSettings } = require('./db');
const { BookingError, normalizePhone } = require('./booking');
const { ticketTotals, parseCents } = require('./money');
const { localToUtc, addDays } = require('./tz');
const teamhub = require('./teamhub');

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => 'T-' + Array.from({ length: 5 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const TICKET_SQL = `
  SELECT t.*, a.code AS appointment_code, a.starts_at AS appointment_starts_at,
         c.name AS client_name, c.phone AS client_phone, c.email AS client_email,
         rb.slug AS rung_by_slug, rb.name AS rung_by_name
    FROM tickets t
    LEFT JOIN appointments a ON a.id = t.appointment_id
    LEFT JOIN clients c ON c.id = t.client_id
    LEFT JOIN stylists rb ON rb.id = t.rung_by`;

const LINES_SQL = `
  SELECT l.*, p.slug AS provider_slug, p.name AS provider_name, s.slug AS service_slug, v.name AS variation_name
    FROM ticket_lines l
    JOIN stylists p ON p.id = l.provider_id
    LEFT JOIN services s ON s.id = l.service_id
    LEFT JOIN service_variations v ON v.id = l.variation_id
   WHERE l.ticket_id = $1 ORDER BY l.sort, l.id`;

function shapeLine(l) {
  return {
    id: l.id, kind: l.kind, name: l.name, quantity: l.quantity,
    provider: { id: l.provider_id, slug: l.provider_slug, name: l.provider_name },
    service: l.service_id ? { id: l.service_id, slug: l.service_slug, variation: l.variation_name || null } : null,
    retailItemId: l.retail_item_id || null,
    gross_cents: l.gross_cents, discount_cents: l.discount_cents, discount_reason: l.discount_reason, tax_cents: l.tax_cents,
    net_cents: l.gross_cents == null ? null : l.gross_cents * l.quantity - l.discount_cents
  };
}

function shapeTicket(t, lines, refunds = []) {
  return {
    code: t.code, status: t.status, openedAt: t.opened_at, paidAt: t.paid_at, voidedAt: t.voided_at,
    appointment: t.appointment_id ? { code: t.appointment_code, startsAt: t.appointment_starts_at } : null,
    client: t.client_id ? { id: t.client_id, name: t.client_name, phone: t.client_phone, email: t.client_email } : null,
    rungBy: t.rung_by ? { slug: t.rung_by_slug, name: t.rung_by_name } : null,
    tender: t.tender, tenderRef: t.tender_ref, note: t.note,
    tip_cents: t.tip_cents, subtotal_cents: t.subtotal_cents, discount_cents: t.discount_cents,
    tax_cents: t.tax_cents, total_cents: t.total_cents,
    refunded_cents: refunds.reduce((s, r) => s + r.amount_cents, 0),
    refunds: refunds.map(r => ({ id: r.id, amount_cents: r.amount_cents, reason: r.reason, at: r.created_at })),
    hub: { syncedAt: t.hub_synced_at || null, error: t.hub_error || null },
    lines: lines.map(shapeLine)
  };
}

async function loadTicket(code, c = { query }) {
  const { rows: [t] } = await c.query(`${TICKET_SQL} WHERE t.code = $1`, [String(code || '').trim().toUpperCase()]);
  if (!t) throw new BookingError(404, 'No ticket with that code');
  const [{ rows: lines }, { rows: refunds }] = await Promise.all([
    c.query(LINES_SQL, [t.id]),
    c.query('SELECT * FROM ticket_refunds WHERE ticket_id = $1 ORDER BY created_at', [t.id])
  ]);
  return { row: t, lines, refunds };
}

async function get(code) { const { row, lines, refunds } = await loadTicket(code); return shapeTicket(row, lines, refunds); }

async function stylistBySlug(slug, c = { query }) {
  const { rows: [s] } = await c.query('SELECT id, slug, name FROM stylists WHERE slug = $1', [slug]);
  if (!s) throw new BookingError(404, 'Unknown stylist: ' + slug);
  return s;
}

// Recompute and store the ticket's totals from its lines.
async function recalc(ticketId, c) {
  const settings = await getSettings();
  const { rows: lines } = await c.query(
    `SELECT l.*, COALESCE(r.taxable, false) AS taxable FROM ticket_lines l LEFT JOIN retail_items r ON r.id = l.retail_item_id WHERE l.ticket_id = $1`, [ticketId]);
  const t = ticketTotals(lines.map(l => ({ ...l, tax_cents: l.tax_cents, taxable: l.kind === 'retail' && (l.retail_item_id ? l.taxable : true) })),
                         { taxRateBps: Number(settings.tax_rate_bps) || 0 });
  await c.query(`UPDATE tickets SET subtotal_cents=$2, discount_cents=$3, tax_cents=$4, total_cents=$5 WHERE id=$1`,
    [ticketId, t.subtotal, t.discount, t.tax, t.total]);
  return t;
}

/**
 * Open a ticket. From an appointment: the client and a first service line
 * (provider = the booked stylist, price = the service's "from" price, or
 * unpriced if none) are prefilled. Walk-in: optional client name/phone.
 */
async function open({ appointmentCode = null, client = null, rungBy = null, note = '' }) {
  return withTransaction(async (c) => {
    let appt = null, clientId = null;
    if (appointmentCode) {
      const { rows: [a] } = await c.query(
        `SELECT a.id, a.client_id, a.stylist_id, a.service_id, a.variation_id, a.variation_name, a.status,
                s.name AS service_name, s.price_from_cents
           FROM appointments a JOIN services s ON s.id = a.service_id WHERE a.code = $1`, [String(appointmentCode).toUpperCase()]);
      if (!a) throw new BookingError(404, 'No appointment with that code');
      if (a.status === 'cancelled') throw new BookingError(409, 'That appointment is cancelled');
      const { rows: [dup] } = await c.query(`SELECT code FROM tickets WHERE appointment_id = $1 AND status <> 'voided'`, [a.id]);
      if (dup) throw new BookingError(409, `This appointment already has ticket ${dup.code}`);
      appt = a; clientId = a.client_id;
    } else if (client && (client.name || client.phone)) {
      const name = String(client.name || 'Walk-in').trim();
      if (client.phone) {
        const phone = normalizePhone(client.phone);
        const { rows: [cl] } = await c.query(
          `INSERT INTO clients (name, phone) VALUES ($1, $2) ON CONFLICT (phone) DO UPDATE SET name = COALESCE(NULLIF(EXCLUDED.name, 'Walk-in'), clients.name) RETURNING id`,
          [name, phone]);
        clientId = cl.id;
      }
    }
    const rungById = rungBy ? (await stylistBySlug(rungBy, c)).id : null;
    let code, t;
    for (let i = 0; ; i++) {
      code = newCode();
      try {
        ({ rows: [t] } = await c.query(
          `INSERT INTO tickets (code, appointment_id, client_id, rung_by, note) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [code, appt?.id || null, clientId, rungById, String(note || '').slice(0, 500)]));
        break;
      } catch (e) { if (e.code === '23505' && i < 3) continue; throw e; }
    }
    if (appt) {
      await c.query(
        `INSERT INTO ticket_lines (ticket_id, kind, provider_id, service_id, variation_id, name, quantity, gross_cents, sort)
         VALUES ($1, 'service', $2, $3, $4, $5, 1, $6, 0)`,
        [t.id, appt.stylist_id, appt.service_id, appt.variation_id,
         appt.variation_name && appt.variation_name !== 'Regular' ? `${appt.service_name} (${appt.variation_name})` : appt.service_name,
         appt.price_from_cents]);
    }
    await recalc(t.id, c);
    const loaded = await loadTicket(code, c);
    return shapeTicket(loaded.row, loaded.lines, loaded.refunds);
  });
}

async function assertOpen(code, c) {
  const { rows: [t] } = await c.query('SELECT id, status, appointment_id FROM tickets WHERE code = $1', [String(code || '').toUpperCase()]);
  if (!t) throw new BookingError(404, 'No ticket with that code');
  if (t.status !== 'open') throw new BookingError(409, `Ticket is ${t.status}; only open tickets can be edited`);
  return t;
}

/**
 * Add a line. kind 'service' needs serviceSlug (+variationId when the service
 * has several); 'retail' needs retailItemId or a name + price. provider is
 * always required — the employee who delivered this line.
 */
async function addLine(code, line) {
  return withTransaction(async (c) => {
    const t = await assertOpen(code, c);
    const provider = await stylistBySlug(line.provider, c);
    const kind = line.kind === 'retail' ? 'retail' : 'service';
    const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
    const gross = line.gross_cents === undefined ? undefined : parseCents(line.gross_cents);
    if (Number.isNaN(gross)) throw new BookingError(400, 'Amount must be a number like 85 or 85.50');
    const discount = parseCents(line.discount_cents) || 0;
    if (Number.isNaN(discount) || discount < 0) throw new BookingError(400, 'Discount must be a positive amount');
    let name = String(line.name || '').trim(), serviceId = null, variationId = null, retailId = null, price = gross ?? null;

    if (kind === 'service' && line.serviceSlug) {
      const { rows: [s] } = await c.query('SELECT id, name, price_from_cents FROM services WHERE slug = $1', [line.serviceSlug]);
      if (!s) throw new BookingError(404, 'Unknown service');
      serviceId = s.id; name = name || s.name; if (price == null) price = s.price_from_cents;
      if (line.variationId) {
        const { rows: [v] } = await c.query('SELECT id, name FROM service_variations WHERE id = $1 AND service_id = $2', [Number(line.variationId), s.id]);
        if (!v) throw new BookingError(404, 'Unknown option for that service');
        variationId = v.id; if (!line.name && v.name !== 'Regular') name = `${s.name} (${v.name})`;
      }
    } else if (kind === 'retail' && line.retailItemId) {
      const { rows: [r] } = await c.query('SELECT id, name, price_cents FROM retail_items WHERE id = $1 AND active', [Number(line.retailItemId)]);
      if (!r) throw new BookingError(404, 'Unknown retail item');
      retailId = r.id; name = name || r.name; if (price == null) price = r.price_cents;
    }
    if (!name) throw new BookingError(400, 'A line needs a name');
    if (price != null && discount > price * qty) throw new BookingError(400, 'Discount is larger than the line');
    const tax = line.tax_cents === undefined || line.tax_cents === null || line.tax_cents === '' ? null : parseCents(line.tax_cents);

    const { rows: [n] } = await c.query('SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM ticket_lines WHERE ticket_id = $1', [t.id]);
    await c.query(
      `INSERT INTO ticket_lines (ticket_id, kind, provider_id, service_id, variation_id, retail_item_id, name, quantity, gross_cents, discount_cents, discount_reason, tax_cents, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [t.id, kind, provider.id, serviceId, variationId, retailId, name, qty, price, discount, String(line.discount_reason || '').slice(0, 200), tax ?? 0, n.s]);
    // A NULL tax_cents means "compute from the rate"; recalc writes the computed values back.
    if (tax == null) {
      const settings = await getSettings();
      const taxable = kind === 'retail';
      const computed = price == null || !taxable ? 0 : Math.round((price * qty - discount) * (Number(settings.tax_rate_bps) || 0) / 10000);
      await c.query('UPDATE ticket_lines SET tax_cents = $2 WHERE ticket_id = $1 AND sort = $3', [t.id, computed, n.s]);
    }
    await recalc(t.id, c);
    const loaded = await loadTicket(code, c);
    return shapeTicket(loaded.row, loaded.lines, loaded.refunds);
  });
}

async function updateLine(code, lineId, patch) {
  return withTransaction(async (c) => {
    const t = await assertOpen(code, c);
    const { rows: [l] } = await c.query('SELECT * FROM ticket_lines WHERE id = $1 AND ticket_id = $2', [Number(lineId), t.id]);
    if (!l) throw new BookingError(404, 'No such line on this ticket');
    const fields = [], vals = [l.id];
    const set = (col, v) => { vals.push(v); fields.push(`${col} = $${vals.length}`); };
    if (patch.provider) set('provider_id', (await stylistBySlug(patch.provider, c)).id);
    if (patch.gross_cents !== undefined) { const g = parseCents(patch.gross_cents); if (Number.isNaN(g)) throw new BookingError(400, 'Amount must be a number'); set('gross_cents', g); }
    if (patch.discount_cents !== undefined) { const d = parseCents(patch.discount_cents) || 0; if (Number.isNaN(d) || d < 0) throw new BookingError(400, 'Discount must be a positive amount'); set('discount_cents', d); }
    if (patch.discount_reason !== undefined) set('discount_reason', String(patch.discount_reason).slice(0, 200));
    if (patch.tax_cents !== undefined) { const x = parseCents(patch.tax_cents) || 0; if (Number.isNaN(x) || x < 0) throw new BookingError(400, 'Tax must be a positive amount'); set('tax_cents', x); }
    if (patch.quantity !== undefined) set('quantity', Math.max(1, Math.floor(Number(patch.quantity) || 1)));
    if (patch.name !== undefined && String(patch.name).trim()) set('name', String(patch.name).trim());
    if (fields.length) await c.query(`UPDATE ticket_lines SET ${fields.join(', ')} WHERE id = $1`, vals);
    // Tax follows the amount unless it was set by hand.
    if (patch.tax_cents === undefined && l.kind === 'retail') {
      const { rows: [cur] } = await c.query(
        `SELECT l.gross_cents, l.quantity, l.discount_cents, COALESCE(r.taxable, true) AS taxable
           FROM ticket_lines l LEFT JOIN retail_items r ON r.id = l.retail_item_id WHERE l.id = $1`, [l.id]);
      const settings = await getSettings();
      const tax = cur.gross_cents == null || !cur.taxable ? 0
        : Math.round((cur.gross_cents * cur.quantity - cur.discount_cents) * (Number(settings.tax_rate_bps) || 0) / 10000);
      await c.query('UPDATE ticket_lines SET tax_cents = $2 WHERE id = $1', [l.id, tax]);
    }
    await recalc(t.id, c);
    const loaded = await loadTicket(code, c);
    return shapeTicket(loaded.row, loaded.lines, loaded.refunds);
  });
}

async function removeLine(code, lineId) {
  return withTransaction(async (c) => {
    const t = await assertOpen(code, c);
    const { rowCount } = await c.query('DELETE FROM ticket_lines WHERE id = $1 AND ticket_id = $2', [Number(lineId), t.id]);
    if (!rowCount) throw new BookingError(404, 'No such line on this ticket');
    await recalc(t.id, c);
    const loaded = await loadTicket(code, c);
    return shapeTicket(loaded.row, loaded.lines, loaded.refunds);
  });
}

/**
 * Take payment. Refuses an empty ticket or one with an unpriced line — a
 * missing price is a question for a person, never $0. A paid ticket marks its
 * appointment completed and is pushed to the hub.
 */
async function pay(code, { tender, tipCents = 0, tenderRef = '', rungBy = null }) {
  if (!['card', 'cash', 'other'].includes(tender)) throw new BookingError(400, 'Tender must be card, cash or other');
  const tip = parseCents(tipCents) || 0;
  if (Number.isNaN(tip) || tip < 0) throw new BookingError(400, 'Tip must be a positive amount');
  const paid = await withTransaction(async (c) => {
    const t = await assertOpen(code, c);
    const { rows: lines } = await c.query('SELECT gross_cents FROM ticket_lines WHERE ticket_id = $1', [t.id]);
    if (!lines.length) throw new BookingError(400, 'Add at least one line before taking payment');
    const unpriced = lines.filter(l => l.gross_cents == null).length;
    if (unpriced) throw new BookingError(400, `${unpriced} line${unpriced === 1 ? ' has' : 's have'} no price — enter the amount before paying`);
    const rungById = rungBy ? (await stylistBySlug(rungBy, c)).id : null;
    await recalc(t.id, c);
    await c.query(
      `UPDATE tickets SET status = 'paid', paid_at = now(), tender = $2, tender_ref = $3, tip_cents = $4, rung_by = COALESCE($5, rung_by) WHERE id = $1`,
      [t.id, tender, String(tenderRef || '').slice(0, 120), tip, rungById]);
    if (t.appointment_id) await c.query(`UPDATE appointments SET status = 'completed' WHERE id = $1 AND status = 'confirmed'`, [t.appointment_id]);
    const loaded = await loadTicket(code, c);
    return shapeTicket(loaded.row, loaded.lines, loaded.refunds);
  });
  paid.hub = await syncTicket(paid);
  return paid;
}

async function voidTicket(code, reason = '') {
  const t = await withTransaction(async (c) => {
    const { rows: [row] } = await c.query('SELECT id, status, appointment_id FROM tickets WHERE code = $1', [String(code || '').toUpperCase()]);
    if (!row) throw new BookingError(404, 'No ticket with that code');
    if (row.status === 'voided') throw new BookingError(409, 'Already voided');
    if (['refunded', 'partially_refunded'].includes(row.status)) throw new BookingError(409, 'A refunded ticket cannot be voided');
    await c.query(`UPDATE tickets SET status = 'voided', voided_at = now(), note = CASE WHEN $2 <> '' THEN note || ' [void: ' || $2 || ']' ELSE note END WHERE id = $1`, [row.id, String(reason).slice(0, 200)]);
    if (row.appointment_id) await c.query(`UPDATE appointments SET status = 'confirmed' WHERE id = $1 AND status = 'completed'`, [row.appointment_id]);
    const loaded = await loadTicket(code, c);
    return shapeTicket(loaded.row, loaded.lines, loaded.refunds);
  });
  t.hub = await syncTicket(t);
  return t;
}

async function refund(code, { amountCents, reason = '', by = null }) {
  const amount = parseCents(amountCents);
  if (!amount || Number.isNaN(amount) || amount <= 0) throw new BookingError(400, 'Refund amount must be more than zero');
  const t = await withTransaction(async (c) => {
    const { row, refunds } = await loadTicket(code, c);
    if (!['paid', 'partially_refunded'].includes(row.status)) throw new BookingError(409, `Only a paid ticket can be refunded (this one is ${row.status})`);
    const already = refunds.reduce((s, r) => s + r.amount_cents, 0);
    const max = row.total_cents + row.tip_cents - already;
    if (amount > max) throw new BookingError(400, `Refund can't exceed the remaining $${(max / 100).toFixed(2)}`);
    await c.query('INSERT INTO ticket_refunds (ticket_id, amount_cents, reason, created_by) VALUES ($1,$2,$3,$4)', [row.id, amount, String(reason).slice(0, 200), by]);
    const status = already + amount >= row.total_cents + row.tip_cents ? 'refunded' : 'partially_refunded';
    await c.query('UPDATE tickets SET status = $2 WHERE id = $1', [row.id, status]);
    const loaded = await loadTicket(code, c);
    return shapeTicket(loaded.row, loaded.lines, loaded.refunds);
  });
  t.hub = await syncTicket(t);
  return t;
}

// Tickets opened on a local day (all statuses), or paid in a range.
async function listDay(date) {
  if (!YMD.test(date)) throw new BookingError(400, 'Date must be YYYY-MM-DD');
  const settings = await getSettings();
  const from = localToUtc(date, 0, settings.time_zone), to = localToUtc(addDays(date, 1), 0, settings.time_zone);
  const { rows } = await query(`${TICKET_SQL} WHERE t.opened_at >= $1 AND t.opened_at < $2 ORDER BY t.opened_at`, [from, to]);
  return Promise.all(rows.map(async r => {
    const [{ rows: lines }, { rows: refunds }] = await Promise.all([query(LINES_SQL, [r.id]), query('SELECT * FROM ticket_refunds WHERE ticket_id = $1', [r.id])]);
    return shapeTicket(r, lines, refunds);
  }));
}

async function listRange({ from, to, status = null, limit = 500 }) {
  if (!YMD.test(from || '') || !YMD.test(to || '')) throw new BookingError(400, 'from and to must be YYYY-MM-DD');
  const settings = await getSettings();
  const a = localToUtc(from, 0, settings.time_zone), b = localToUtc(addDays(to, 1), 0, settings.time_zone);
  const { rows } = await query(
    `${TICKET_SQL} WHERE COALESCE(t.paid_at, t.opened_at) >= $1 AND COALESCE(t.paid_at, t.opened_at) < $2 ${status ? 'AND t.status = $4' : ''}
      ORDER BY COALESCE(t.paid_at, t.opened_at) LIMIT $3`, status ? [a, b, limit, status] : [a, b, limit]);
  return Promise.all(rows.map(async r => {
    const [{ rows: lines }, { rows: refunds }] = await Promise.all([query(LINES_SQL, [r.id]), query('SELECT * FROM ticket_refunds WHERE ticket_id = $1', [r.id])]);
    return shapeTicket(r, lines, refunds);
  }));
}

// ── Retail items ───────────────────────────────────────────────────────────
async function listRetail() {
  const { rows } = await query('SELECT id, sku, name, price_cents, taxable, active FROM retail_items ORDER BY active DESC, sort, name');
  return rows;
}
async function saveRetail({ id = null, sku = '', name, price_cents, taxable = true, active = true }) {
  name = String(name || '').trim(); if (!name) throw new BookingError(400, 'Name is required');
  const price = parseCents(price_cents); if (Number.isNaN(price)) throw new BookingError(400, 'Price must be a number');
  sku = String(sku || '').trim() || null;
  if (id) {
    const { rows: [r] } = await query('UPDATE retail_items SET sku=$2, name=$3, price_cents=$4, taxable=$5, active=$6 WHERE id=$1 RETURNING id', [Number(id), sku, name, price, !!taxable, !!active]);
    if (!r) throw new BookingError(404, 'No such item');
    return { id: r.id };
  }
  const { rows: [r] } = await query('INSERT INTO retail_items (sku, name, price_cents, taxable, active) VALUES ($1,$2,$3,$4,$5) RETURNING id', [sku, name, price, !!taxable, !!active]);
  return { id: r.id };
}

// ── Hub ────────────────────────────────────────────────────────────────────
// The hub has no ticket receiver yet (that's hub-side work); until it does,
// tickets are read through /api/v1. When TEAMHUB_TICKET_WEBHOOK_URL is set,
// each paid/voided/refunded ticket is also pushed there.
async function syncTicket(t) {
  const url = process.env.TEAMHUB_TICKET_WEBHOOK_URL, secret = process.env.TEAMHUB_SECRET;
  if (!url || !secret) return { skipped: 'ticket webhook not configured' };
  let result;
  try {
    const r = await teamhub._fetchForTickets(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-webhook-secret': secret },
      body: JSON.stringify({ source: 'crownheirs', event: 'ticket.' + t.status, ticket: t })
    });
    result = r.ok ? { sent: true } : { error: `Team Hub answered ${r.status}` };
  } catch (e) { result = { error: 'Could not reach Team Hub: ' + (e.message || e) }; }
  try {
    await query(`UPDATE tickets SET hub_synced_at = CASE WHEN $2 THEN now() ELSE hub_synced_at END, hub_error = $3 WHERE code = $1`, [t.code, !!result.sent, result.error || null]);
  } catch (e) { /* advisory */ }
  return result;
}

module.exports = { open, addLine, updateLine, removeLine, pay, voidTicket, refund, get, listDay, listRange, listRetail, saveRetail };
