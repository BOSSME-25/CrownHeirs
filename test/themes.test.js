// Theme-day rules that need no database: which theme applies on a day, who
// is its audience, and the client-facing notice.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../lib/themes');

const friday = { id: 1, name: 'Family Friday', audience: 'family', ruleKind: 'weekly', weekday: 5, active: true, sort: 0, body: 'Expect children to be present and heard.' };
const saturday = { id: 2, name: 'Zin Saturday', audience: 'adults', ruleKind: 'weekly', weekday: 6, active: true, sort: 0, body: '' };
const mothers = { id: 3, name: "Mother's Day Saturday", audience: 'everyone', ruleKind: 'date', onDate: '2027-05-08', active: true, sort: 0, headline: 'Treat her' };
const off = { ...saturday, id: 4, active: false, name: 'Old Saturday' };
const bounded = { id: 5, name: 'Summer Sundays', audience: 'everyone', ruleKind: 'weekly', weekday: 0, startsOn: '2027-06-01', endsOn: '2027-08-31', active: true, sort: 0 };

test('pick: weekly rules by weekday, a dated theme wins its day, inactive and out-of-range rules are ignored', () => {
  const all = [friday, saturday, mothers, off, bounded];
  assert.equal(T.pick(all, '2027-05-07').name, 'Family Friday');           // a Friday
  assert.equal(T.pick(all, '2027-05-01').name, 'Zin Saturday');            // a Saturday
  assert.equal(T.pick(all, '2027-05-08').name, "Mother's Day Saturday");   // dated beats weekly
  assert.equal(T.pick(all, '2027-05-10'), null);                           // a Monday
  assert.equal(T.pick(all, '2027-05-02'), null);                           // Sunday before the bounded rule starts
  assert.equal(T.pick(all, '2027-06-06').name, 'Summer Sundays');
  assert.equal(T.pick(all, '2027-09-05'), null);                           // after it ends
});

test('fits: families and children fit a family day; children do not fit an adults day; everyone fits everyone', () => {
  assert.equal(T.fits(friday, { family: true, categories: ['Locs'] }), true);
  assert.equal(T.fits(friday, { family: false, categories: ['Tiny Heirs'] }), true);
  assert.equal(T.fits(friday, { family: false, categories: ['Locs'] }), false);
  assert.equal(T.fits(saturday, { family: false, categories: ['Locs'] }), true);
  assert.equal(T.fits(saturday, { family: true, categories: ['Locs', 'Tiny Heirs'] }), false);
  assert.equal(T.fits(mothers, { family: false, categories: ['Tiny Heirs'] }), true);
  assert.equal(T.fits(null, {}), true);
});

test('notice: says what kind of day it is and that the appointment may be moved', () => {
  assert.match(T.notice(friday), /Family Friday is a family day\. Expect children.*may be moved/);
  assert.match(T.notice(saturday), /child-free day/);
});
