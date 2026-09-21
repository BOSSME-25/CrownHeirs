// The scheduling brain, as a pure function: no database, no clock of its own.
// Everything it needs is passed in, so it can be tested exhaustively in Node
// and the API layer is just plumbing around it.
const { localToUtc, weekdayOf } = require('./tz');

/**
 * Bookable start times for ONE stylist on ONE calendar day.
 *
 * @param {object} p
 * @param {string} p.date         'YYYY-MM-DD' in the salon's zone
 * @param {string} p.tz           IANA zone, e.g. 'America/Phoenix'
 * @param {Array<{weekday:number,startMin:number,endMin:number}>} p.hours
 *        recurring weekly working blocks (any weekday — filtered here)
 * @param {Array<{start:Date,end:Date}>} p.busy
 *        intervals already taken: appointments (whose `end` already includes
 *        their own cleanup buffer) and time off
 * @param {number} p.durationMin  service length
 * @param {number} [p.bufferMin]  cleanup needed AFTER this service before the next client
 * @param {number} [p.stepMin]    slot grid, default 15
 * @param {number} [p.leadMin]    earliest start = now + lead, default 0
 * @param {Date}   [p.now]        required if leadMin is used
 * @returns {Array<{start:Date,end:Date}>}  `end` is what the client sees (no buffer)
 */
function computeSlots(p) {
  const weekday = weekdayOf(p.date);
  const blocks = (p.hours || []).filter(h => h.weekday === weekday);
  if (!blocks.length) return [];

  const durMs  = p.durationMin * 60000;
  const needMs = durMs + (p.bufferMin || 0) * 60000;   // what we must keep clear
  const stepMs = (p.stepMin || 15) * 60000;
  const earliest = p.now ? p.now.getTime() + (p.leadMin || 0) * 60000 : -Infinity;
  const busy = mergeIntervals(p.busy || []);

  const out = [];
  for (const b of blocks) {
    const bStart = localToUtc(p.date, b.startMin, p.tz).getTime();
    const bEnd   = localToUtc(p.date, b.endMin,   p.tz).getTime();
    // The service itself must fit inside working hours; the trailing buffer
    // only has to stay clear of the NEXT booking, not of closing time.
    for (let t = bStart; t + durMs <= bEnd; t += stepMs) {
      if (t < earliest) continue;
      if (clashes(t, t + needMs, busy)) continue;
      out.push({ start: new Date(t), end: new Date(t + durMs) });
    }
  }
  // Blocks could in theory overlap or be unsorted; keep unique, ascending.
  out.sort((a, b) => a.start - b.start);
  return out.filter((s, i) => i === 0 || s.start.getTime() !== out[i - 1].start.getTime());
}

// Does [t0, t1) intersect any busy interval? Half-open on both sides, so an
// appointment ending exactly when the next starts is NOT a clash.
function clashes(t0, t1, busy) {
  for (const b of busy) {
    if (b.start < t1 && b.end > t0) return true;
    if (b.start >= t1) break;              // sorted → nothing later can clash
  }
  return false;
}

// Sort and merge overlapping/adjacent intervals into ms tuples.
function mergeIntervals(list) {
  const iv = list
    .map(x => ({ start: +x.start, end: +x.end }))
    .filter(x => x.end > x.start)
    .sort((a, b) => a.start - b.start);
  const out = [];
  for (const x of iv) {
    const last = out[out.length - 1];
    if (last && x.start <= last.end) last.end = Math.max(last.end, x.end);
    else out.push({ ...x });
  }
  return out;
}

/**
 * Is a specific start time bookable? Used at booking time to re-validate
 * what the client picked, so the API never trusts a slot it didn't offer.
 */
function isBookable(startAt, p) {
  const t = +startAt;
  return computeSlots({ ...p, stepMin: 1 }).some(s => +s.start === t);
}

module.exports = { computeSlots, isBookable, mergeIntervals };
