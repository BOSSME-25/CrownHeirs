// Run: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const { computeSlots, isBookable, mergeIntervals } = require('../lib/availability');
const { localToUtc, utcToLocal, zoneOffsetMin, weekdayOf } = require('../lib/tz');

const PHX = 'America/Phoenix';
const TUE = '2026-09-22';   // a Tuesday
const SUN = '2026-09-20';
const at = (min) => localToUtc(TUE, min, PHX);
const hhmm = (d) => { const l = utcToLocal(d, PHX); return `${String(Math.floor(l.minutes / 60)).padStart(2, '0')}:${String(l.minutes % 60).padStart(2, '0')}`; };
const HOURS = [{ weekday: 2, startMin: 9 * 60, endMin: 18 * 60 }]; // Tue 9–6

test('tz: Phoenix is UTC-7 in both winter and summer (no DST)', () => {
  assert.equal(zoneOffsetMin(new Date('2026-01-15T12:00:00Z'), PHX), -420);
  assert.equal(zoneOffsetMin(new Date('2026-07-15T12:00:00Z'), PHX), -420);
  assert.equal(localToUtc('2026-07-15', 9 * 60, PHX).toISOString(), '2026-07-15T16:00:00.000Z');
});

test('tz: a DST zone shifts correctly across the year', () => {
  assert.equal(localToUtc('2026-01-01', 10 * 60, 'America/New_York').toISOString(), '2026-01-01T15:00:00.000Z');
  assert.equal(localToUtc('2026-07-01', 10 * 60, 'America/New_York').toISOString(), '2026-07-01T14:00:00.000Z');
});

test('tz: round trip and weekday', () => {
  const d = localToUtc(TUE, 13 * 60 + 45, PHX);
  assert.deepEqual(utcToLocal(d, PHX), { ymd: TUE, minutes: 13 * 60 + 45, weekday: 2 });
  assert.equal(weekdayOf(SUN), 0);
});

test('open day, nothing booked: slots run 9:00 through last fit before close', () => {
  const s = computeSlots({ date: TUE, tz: PHX, hours: HOURS, busy: [], durationMin: 60, bufferMin: 15 });
  assert.equal(hhmm(s[0].start), '09:00');
  assert.equal(hhmm(s[s.length - 1].start), '17:00');   // 17:00+60 = close; buffer needn't fit
  assert.equal(hhmm(s[s.length - 1].end), '18:00');
  assert.equal(s.length, 33);                              // 9:00..17:00 every 15 min
});

test('closed day yields nothing', () => {
  assert.deepEqual(computeSlots({ date: SUN, tz: PHX, hours: HOURS, busy: [], durationMin: 60 }), []);
});

test('an existing appointment (with its buffer) carves out the right gap', () => {
  // 12:00 appt, 60 min + 15 buffer → busy 12:00–13:15
  const busy = [{ start: at(12 * 60), end: at(13 * 60 + 15) }];
  const s = computeSlots({ date: TUE, tz: PHX, hours: HOURS, busy, durationMin: 60, bufferMin: 15 }).map(x => hhmm(x.start));
  assert.ok(s.includes('10:45'), 'ends 11:45 + 15 buffer = 12:00 exactly → allowed');
  assert.ok(!s.includes('11:00'), 'would run into the 12:00 booking');
  assert.ok(!s.includes('13:00'), 'inside the previous client\'s buffer');
  assert.ok(s.includes('13:15'), 'first start after the buffer clears');
});

test('lead time hides slots that are too soon', () => {
  const now = at(10 * 60);                                 // 10:00 local
  const s = computeSlots({ date: TUE, tz: PHX, hours: HOURS, busy: [], durationMin: 30, leadMin: 120, now }).map(x => hhmm(x.start));
  assert.equal(s[0], '12:00');
});

test('service that does not fit before close is excluded', () => {
  const s = computeSlots({ date: TUE, tz: PHX, hours: HOURS, busy: [], durationMin: 240 }).map(x => hhmm(x.start));
  assert.equal(s[s.length - 1], '14:00');
});

test('split shift (two blocks) and time off across a block', () => {
  const hours = [
    { weekday: 2, startMin: 9 * 60, endMin: 12 * 60 },
    { weekday: 2, startMin: 14 * 60, endMin: 18 * 60 }
  ];
  const busy = [{ start: at(15 * 60), end: at(16 * 60) }]; // out 3–4pm
  const s = computeSlots({ date: TUE, tz: PHX, hours, busy, durationMin: 60 }).map(x => hhmm(x.start));
  assert.ok(!s.includes('11:15') && s.includes('11:00'), 'lunch gap respected');
  assert.ok(!s.includes('12:00') && !s.includes('13:00'));
  assert.ok(s.includes('14:00') && !s.includes('14:15') && s.includes('16:00'));
});

test('mergeIntervals joins overlaps and drops empties', () => {
  const m = mergeIntervals([
    { start: 10, end: 20 }, { start: 15, end: 25 }, { start: 30, end: 30 }, { start: 5, end: 8 }
  ]);
  assert.deepEqual(m, [{ start: 5, end: 8 }, { start: 10, end: 25 }]);
});

test('isBookable re-validates an exact start, including off-grid rejections', () => {
  const p = { date: TUE, tz: PHX, hours: HOURS, busy: [], durationMin: 60, bufferMin: 15 };
  assert.equal(isBookable(at(9 * 60), p), true);
  assert.equal(isBookable(at(8 * 60), p), false);          // before opening
  assert.equal(isBookable(at(17 * 60 + 30), p), false);    // would end 18:30
  assert.equal(isBookable(at(9 * 60 + 7), p), true);       // any minute is valid to re-check
});
