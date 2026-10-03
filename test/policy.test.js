// Deposit and cancellation rules, no database.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/policy');
const { ticketTotals } = require('../lib/money');

const settings = { deposit_percent: 25, deposit_min_cents: 2500, cancel_window_hours: 24, late_grace_min: 15, policy_text: '' };

test('depositFor: a percentage with a floor, capped at the price; overrides; nothing for unpriced', () => {
  assert.equal(P.depositFor({ price_from_cents: 20000 }, settings), 5000);          // 25% of $200
  assert.equal(P.depositFor({ price_from_cents: 4000 }, settings), 2500);           // floor $25 beats 25% of $40
  assert.equal(P.depositFor({ price_from_cents: 1500 }, settings), 1500);           // never more than the price
  assert.equal(P.depositFor({ price_from_cents: null }, settings), 0);
  assert.equal(P.depositFor({ price_from_cents: 9000, deposit_cents: 1000 }, settings), 1000);
  assert.equal(P.depositFor({ price_from_cents: 9000 }, { ...settings, deposit_percent: 0 }), 0);
});

test('isLateCancel / isLate use the window and the grace', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  assert.equal(P.isLateCancel('2026-10-11T11:00:00Z', settings, now), true);      // 23h ahead
  assert.equal(P.isLateCancel('2026-10-11T13:00:00Z', settings, now), false);     // 25h ahead
  assert.equal(P.isLate('2026-10-10T11:40:00Z', settings, now), true);           // 20 min past, grace 15
  assert.equal(P.isLate('2026-10-10T11:50:00Z', settings, now), false);
});

test('cancelOutcome: late + paid forfeits, unless fees are waived; due becomes none; on time keeps it', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  const soon = '2026-10-10T20:00:00Z', later = '2026-10-13T12:00:00Z';
  assert.deepEqual(P.cancelOutcome({ depositStatus: 'paid', startsAt: soon, feeWaived: false }, settings, now), { late: true, deposit: 'forfeited', forfeited: true });
  assert.deepEqual(P.cancelOutcome({ depositStatus: 'paid', startsAt: soon, feeWaived: true }, settings, now), { late: true, deposit: 'paid', forfeited: false });
  assert.deepEqual(P.cancelOutcome({ depositStatus: 'paid', startsAt: later, feeWaived: false }, settings, now), { late: false, deposit: 'paid', forfeited: false });
  assert.deepEqual(P.cancelOutcome({ depositStatus: 'due', startsAt: soon, feeWaived: false }, settings, now), { late: true, deposit: 'none', forfeited: false });
});

test('terms: reads as one policy; the deposit amount and the window appear', () => {
  const t = P.terms(settings, 5000);
  assert.match(t, /\$50 holds your appointment/); assert.match(t, /24 hours/); assert.match(t, /15 minutes/);
  assert.match(P.terms(settings, 0), /^Please cancel or move/);
  assert.match(P.terms({ ...settings, policy_text: 'Hair must be product-free.' }, 0), /product-free/);
});

test('ticketTotals: a paid deposit comes off what is due today, never below zero', () => {
  const lines = [{ gross_cents: 8500, discount_cents: 0, tax_cents: 0, quantity: 1 }];
  const t = ticketTotals(lines, { depositCents: 2500, tipCents: 1000 });
  assert.equal(t.total, 8500); assert.equal(t.deposit, 2500); assert.equal(t.due, 7000);
  assert.equal(ticketTotals(lines, { depositCents: 99999 }).due, 0);
});
