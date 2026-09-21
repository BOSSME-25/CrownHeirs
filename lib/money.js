// Ticket arithmetic, pure. Integer cents throughout; nothing here rounds
// money except tax, which is computed once per line (half-up).
//
// Per line:  gross = unit gross × quantity
//            net   = gross − discount            (discount capped at gross)
//            tax   = given, or rate × net for taxable lines
// Per ticket: subtotal = Σ gross, discount = Σ discount, tax = Σ tax,
//             total = subtotal − discount + tax   (tip is on top, never inside)

function lineTotals(line, { taxRateBps = 0 } = {}) {
  const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
  const priced = line.gross_cents != null;
  const gross = priced ? Math.round(Number(line.gross_cents)) * qty : null;
  const discount = priced ? Math.min(Math.max(0, Math.round(Number(line.discount_cents) || 0)), gross) : 0;
  const net = priced ? gross - discount : null;
  let tax;
  if (line.tax_cents != null && line.tax_cents !== '') tax = Math.max(0, Math.round(Number(line.tax_cents)));
  else if (priced && line.taxable) tax = Math.round(net * taxRateBps / 10000);
  else tax = 0;
  return { priced, quantity: qty, gross, discount, net, tax };
}

function ticketTotals(lines, { taxRateBps = 0, tipCents = 0 } = {}) {
  const t = { subtotal: 0, discount: 0, tax: 0, total: 0, unpriced: 0, lines: [] };
  for (const l of lines) {
    const x = lineTotals(l, { taxRateBps });
    t.lines.push(x);
    if (!x.priced) { t.unpriced++; continue; }
    t.subtotal += x.gross; t.discount += x.discount; t.tax += x.tax;
  }
  t.total = t.subtotal - t.discount + t.tax;
  t.tip = Math.max(0, Math.round(Number(tipCents) || 0));
  t.due = t.total + t.tip;
  return t;
}

// What each provider is owed credit for on a ticket: gross (commission is
// paid on gross), net (KPIs use net), split by service vs retail — computed
// from the lines they delivered, never apportioned.
function byProvider(lines, opts) {
  const out = {};
  for (const l of lines) {
    const x = lineTotals(l, opts);
    if (!x.priced) continue;
    const p = out[l.provider_id] || (out[l.provider_id] = { service_gross: 0, service_net: 0, retail_gross: 0, retail_net: 0 });
    if (l.kind === 'retail') { p.retail_gross += x.gross; p.retail_net += x.net; }
    else { p.service_gross += x.gross; p.service_net += x.net; }
  }
  return out;
}

const parseCents = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Math.round(v);
  const s = String(v).trim().replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
};

module.exports = { lineTotals, ticketTotals, byProvider, parseCents };
