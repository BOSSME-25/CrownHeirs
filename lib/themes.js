// Theme days: Family Fridays, Zin Saturdays, Mother's Day Saturday.
//
// A theme is a weekly rule or a single date. For a given day the dated theme
// wins over a weekly one, and the lowest `sort` wins between equals. The
// booking page shows the theme on the calendar and before the time is chosen;
// the TV announces it; a client who isn't the theme's audience must accept
// that their appointment may be moved; a dated theme can open its date for
// booking before the usual window.
const { query, getSettings } = require('./db');
const { weekdayOf, addDays, todayIn } = require('./tz');
const { BookingError } = require('./booking');

const AUDIENCES = ['family', 'adults', 'everyone'];
const ymd = v => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? null : String(v).slice(0, 10));

const shape = r => ({
  id: r.id, name: r.name, audience: r.audience, headline: r.headline, body: r.body, tvBody: r.tv_body,
  ruleKind: r.rule_kind, weekday: r.weekday, onDate: ymd(r.on_date), startsOn: ymd(r.starts_on), endsOn: ymd(r.ends_on),
  prebookDays: r.prebook_days, active: r.active, sort: r.sort
});

async function list() {
  const { rows } = await query(`SELECT * FROM day_themes ORDER BY active DESC, rule_kind, weekday, on_date, sort, id`);
  return rows.map(shape);
}

async function save(t) {
  const name = String(t.name || '').trim();
  if (!name) throw new BookingError(400, 'A theme needs a name');
  const audience = AUDIENCES.includes(t.audience) ? t.audience : 'everyone';
  const ruleKind = t.ruleKind === 'date' ? 'date' : 'weekly';
  const weekday = ruleKind === 'weekly' ? Number(t.weekday) : null;
  if (ruleKind === 'weekly' && !(weekday >= 0 && weekday <= 6)) throw new BookingError(400, 'Pick a weekday');
  const onDate = ruleKind === 'date' ? ymd(t.onDate) : null;
  if (ruleKind === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(onDate || '')) throw new BookingError(400, 'Pick a date');
  const prebook = Math.max(0, Math.min(365, Number(t.prebookDays) || 0));
  const cols = [name, audience, String(t.headline || '').slice(0, 120), String(t.body || '').slice(0, 1000), String(t.tvBody || '').slice(0, 1000),
    ruleKind, weekday, onDate, ymd(t.startsOn) || null, ymd(t.endsOn) || null, prebook, t.active !== false, Number(t.sort) || 0];
  const { rows: [r] } = t.id
    ? await query(`UPDATE day_themes SET name=$1, audience=$2, headline=$3, body=$4, tv_body=$5, rule_kind=$6, weekday=$7, on_date=$8, starts_on=$9, ends_on=$10, prebook_days=$11, active=$12, sort=$13
                   WHERE id=$14 RETURNING *`, [...cols, t.id])
    : await query(`INSERT INTO day_themes (name, audience, headline, body, tv_body, rule_kind, weekday, on_date, starts_on, ends_on, prebook_days, active, sort)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, cols);
  if (!r) throw new BookingError(404, 'No theme with that id');
  return shape(r);
}

async function remove(id) {
  const { rowCount } = await query(`DELETE FROM day_themes WHERE id = $1`, [id]);
  if (!rowCount) throw new BookingError(404, 'No theme with that id');
  return { ok: true };
}

// Pure: which of `themes` applies on `date`?
function pick(themes, date) {
  const wd = weekdayOf(date);
  const hits = themes.filter(t => t.active && (
    t.ruleKind === 'date' ? t.onDate === date
      : t.weekday === wd && (!t.startsOn || date >= t.startsOn) && (!t.endsOn || date <= t.endsOn)));
  hits.sort((a, b) => (a.ruleKind === 'date' ? 0 : 1) - (b.ruleKind === 'date' ? 0 : 1) || a.sort - b.sort || a.id - b.id);
  return hits[0] || null;
}

async function forDate(date) { return pick(await list(), date); }

// { 'YYYY-MM-DD': { id, name, audience, headline } } for every themed day in a range.
async function forRange(from, to) {
  const themes = await list();
  const out = {};
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const t = pick(themes, d);
    if (t) out[d] = { id: t.id, name: t.name, audience: t.audience, headline: t.headline, body: t.body };
  }
  return out;
}

// Is this booking the theme's audience?
//   family   → a family visit, or a Tiny Heirs (children's) service
//   adults   → anything that is not a children's service
//   everyone → yes
function fits(theme, { family = false, categories = [] } = {}) {
  if (!theme) return true;
  const kids = categories.some(c => /tiny|kid|child/i.test(c));
  if (theme.audience === 'family') return family || kids;
  if (theme.audience === 'adults') return !kids;
  return true;
}

// What the client must accept when they aren't the audience.
function notice(theme) {
  const who = theme.audience === 'family' ? 'a family day' : theme.audience === 'adults' ? 'a child-free day' : 'a themed day';
  return `${theme.name} is ${who}. ${theme.body ? theme.body + ' ' : ''}If you book anyway, your appointment may be moved to make room.`;
}

// The farthest date a client may book: the usual window, or a dated theme's
// prebook window when that reaches further.
async function latestBookable(settings, now = new Date()) {
  const today = todayIn(settings.time_zone, now);
  let latest = addDays(today, settings.max_days_ahead);
  const { rows } = await query(`SELECT on_date, prebook_days FROM day_themes WHERE active AND rule_kind = 'date' AND prebook_days > 0 AND on_date >= $1`, [today]);
  for (const r of rows) {
    const d = ymd(r.on_date);
    if (d > latest && addDays(d, -r.prebook_days) <= today) latest = d;
  }
  return latest;
}

// Everything the booking page needs to show themes on its calendar.
async function calendar(now = new Date()) {
  const settings = await getSettings();
  const today = todayIn(settings.time_zone, now);
  const latest = await latestBookable(settings, now);
  const days = await forRange(today, latest);
  // Dated themes bookable only through prebook (beyond the usual window)
  const usual = addDays(today, settings.max_days_ahead);
  const prebook = Object.entries(days).filter(([d]) => d > usual).map(([d, t]) => ({ date: d, ...t }));
  return { today, latest, usual, days, prebook };
}

module.exports = { list, save, remove, pick, forDate, forRange, fits, notice, latestBookable, calendar, AUDIENCES };
