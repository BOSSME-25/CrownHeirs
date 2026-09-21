// Ticket arithmetic. No database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { lineTotals, ticketTotals, byProvider, parseCents } = require('../lib/money');

test('line: gross × qty, discount capped, tax from rate only on taxable lines', () => {
  assert.deepEqual(lineTotals({ gross_cents: 8500, quantity: 1, discount_cents: 0 }), { priced: true, quantity: 1, gross: 8500, discount: 0, net: 8500, tax: 0 });
  assert.equal(lineTotals({ gross_cents: 2000, quantity: 3, discount_cents: 500 }).net, 5500);
  assert.equal(lineTotals({ gross_cents: 2000, quantity: 1, discount_cents: 9999 }).discount, 2000, 'discount never exceeds gross');
  assert.equal(lineTotals({ gross_cents: 2000, quantity: 1, discount_cents: 0, taxable: true }, { taxRateBps: 860 }).tax, 172);
  assert.equal(lineTotals({ gross_cents: 2000, quantity: 1, discount_cents: 500, taxable: true }, { taxRateBps: 860 }).tax, 129, 'tax on net');
  assert.equal(lineTotals({ gross_cents: 2000, quantity: 1, taxable: false }, { taxRateBps: 860 }).tax, 0, 'services untaxed');
  assert.equal(lineTotals({ gross_cents: 2000, quantity: 1, taxable: true, tax_cents: 100 }, { taxRateBps: 860 }).tax, 100, 'explicit tax wins');
});

test('unpriced line stays unpriced — never zero', () => {
  const x = lineTotals({ gross_cents: null, quantity: 1 });
  assert.equal(x.priced, false); assert.equal(x.gross, null); assert.equal(x.net, null);
  const t = ticketTotals([{ gross_cents: null }, { gross_cents: 5000 }]);
  assert.equal(t.unpriced, 1); assert.equal(t.subtotal, 5000, 'the priced line still counts');
});

test('ticket: subtotal − discount + tax; tip on top', () => {
  const t = ticketTotals([
    { kind: 'service', gross_cents: 8500, quantity: 1, discount_cents: 1000 },
    { kind: 'retail', gross_cents: 2000, quantity: 2, discount_cents: 0, taxable: true }
  ], { taxRateBps: 860, tipCents: 1500 });
  assert.equal(t.subtotal, 12500); assert.equal(t.discount, 1000); assert.equal(t.tax, 344);
  assert.equal(t.total, 11844); assert.equal(t.tip, 1500); assert.equal(t.due, 13344);
});

test('byProvider: each employee gets exactly the lines they delivered, gross and net, service vs retail', () => {
  const p = byProvider([
    { provider_id: 1, kind: 'service', gross_cents: 8500, quantity: 1, discount_cents: 500 },
    { provider_id: 2, kind: 'service', gross_cents: 6500, quantity: 1, discount_cents: 0 },
    { provider_id: 1, kind: 'retail', gross_cents: 2000, quantity: 1, discount_cents: 0 },
    { provider_id: 2, kind: 'service', gross_cents: null }
  ]);
  assert.deepEqual(p[1], { service_gross: 8500, service_net: 8000, retail_gross: 2000, retail_net: 2000 });
  assert.deepEqual(p[2], { service_gross: 6500, service_net: 6500, retail_gross: 0, retail_net: 0 });
});

test('parseCents: dollars in, integer cents out; garbage is NaN; blank is null', () => {
  assert.equal(parseCents('85'), 8500); assert.equal(parseCents('85.5'), 8550); assert.equal(parseCents('$1,250.00'), 125000);
  assert.equal(parseCents(1234), 1234); assert.equal(parseCents(''), null); assert.equal(parseCents(null), null);
  assert.ok(Number.isNaN(parseCents('eighty'))); assert.ok(Number.isNaN(parseCents('1.234')));
});

test('property: for any lines, total = Σnet + Σtax and no provider total exceeds the ticket', () => {
  let seed = 7; const rnd = (n) => { seed = (seed * 48271) % 2147483647; return seed % n; };
  for (let i = 0; i < 300; i++) {
    const lines = Array.from({ length: 1 + rnd(5) }, () => ({ provider_id: 1 + rnd(3), kind: rnd(2) ? 'retail' : 'service', taxable: rnd(2) === 1,
      gross_cents: rnd(4) ? rnd(30000) : null, quantity: 1 + rnd(3), discount_cents: rnd(5000) }));
    const t = ticketTotals(lines, { taxRateBps: rnd(1500) });
    const nets = t.lines.filter(x => x.priced).reduce((s, x) => s + x.net, 0);
    assert.equal(t.total, nets + t.tax);
    const p = byProvider(lines);
    const sumGross = Object.values(p).reduce((s, x) => s + x.service_gross + x.retail_gross, 0);
    assert.equal(sumGross, t.subtotal, 'provider credit is exactly the ticket, no more, no less');
    assert.ok(t.total >= 0);
  }
});
