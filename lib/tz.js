// Wall-clock ↔ UTC conversion for an IANA time zone, with no dependencies.
//
// Salon hours are stored as local minutes-from-midnight ("Tuesday 9:00–18:00")
// while appointments are stored as UTC instants. Everything that bridges the
// two goes through here so the offset is computed by Intl for the zone in
// question — Phoenix never shifts, but a second location in Denver would.

const cache = new Map();
function formatter(tz) {
  let f = cache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    cache.set(tz, f);
  }
  return f;
}

// Minutes the zone is ahead of UTC at the given instant (Phoenix → -420).
function zoneOffsetMin(date, tz) {
  const p = Object.fromEntries(formatter(tz).formatToParts(date).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

// 'YYYY-MM-DD' + minutes-from-midnight in `tz` → UTC Date.
function localToUtc(ymd, minutes, tz) {
  const [y, m, d] = ymd.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, minutes);
  // Guess using the offset at the wall time read as UTC, then re-check with
  // the offset at the resulting instant so a DST boundary can't skew it.
  let off = zoneOffsetMin(new Date(wall), tz);
  let inst = wall - off * 60000;
  const off2 = zoneOffsetMin(new Date(inst), tz);
  if (off2 !== off) inst = wall - off2 * 60000;
  return new Date(inst);
}

// UTC Date → { ymd, minutes, weekday } in `tz`.
function utcToLocal(date, tz) {
  const p = Object.fromEntries(formatter(tz).formatToParts(date).map(x => [x.type, x.value]));
  const ymd = `${p.year}-${p.month}-${p.day}`;
  return { ymd, minutes: +p.hour * 60 + +p.minute, weekday: weekdayOf(ymd) };
}

// Day of week for a calendar date, 0 = Sunday. Independent of zone.
function weekdayOf(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// 'YYYY-MM-DD' for today (or `date`) in `tz`.
function todayIn(tz, date = new Date()) {
  return utcToLocal(date, tz).ymd;
}

// Add n days to a 'YYYY-MM-DD' string.
function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

module.exports = { zoneOffsetMin, localToUtc, utcToLocal, weekdayOf, todayIn, addDays };
