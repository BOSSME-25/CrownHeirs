#!/usr/bin/env node
// Builds public/data/finder-catalog.json from lib/seed-data.json (the Square
// catalog export), so the homepage finder shows Square's prices and times
// instead of hand-typed copies that drift.
//
//   node scripts/build-finder-catalog.js          write the file
//   node scripts/build-finder-catalog.js --check  exit 1 if it is stale
//
// The length table maps the finder's length answer onto the Square options a
// client of that length would book, using Square's own scale (that is what
// the salon charges by). A service without an entry has options that do not
// depend on the client's natural length (e.g. braid size and final length).
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'public', 'data', 'finder-catalog.json');

// Square's length scale, shown on the finder's length tiles.
const LENGTH_SCALE = {
  twa:    { label: 'Very Short', desc: 'Close to the scalp' },
  short:  { label: 'Short',      desc: 'To the top of the nape' },
  medium: { label: 'Medium',     desc: 'Neck length' },
  long:   { label: 'Long',       desc: 'Shoulder length or past' }
};

// slug → { lengthKey: regex over the option name }
const LENGTH_RULES = {
  'mini-twists-two-strands':                 { twa: /Short/, short: /Short/, medium: /Medium \/ Neck/, long: /Long Hair/ },
  'mini-twists-two-strands-with-added-hair': { twa: /Short/, short: /Short/, medium: /Medium \/ Neck/, long: /Long Hair/ },
  'natural-hair-braiding':   { short: /^Short - Medium/, medium: /^Short - Medium|^Medium - Long/, long: /^Medium - Long|^Long - Extra Long/ },
  'loose-natural-styles':    { twa: /^Short Hair$/, short: /^Short Hair$/, medium: /^Medium /, long: /^Long |^Extra Long/ },
  'hair-cut':                { twa: /Pixie|Barber Cut/, short: /Pixie/, medium: /Medium to Long/, long: /Medium to Long|Extra Long/ },
  'keratin-treatment-crown-smooth-experience': { short: /Short to Medium/, medium: /Short to Medium/, long: /^Long$|Extra Long/ },
  'chemical-relaxer':        { short: /Short|Root Touch|Edge Up/, medium: /Short|Long|Root Touch|Edge Up/, long: /Long|Root Touch|Edge Up/ },
  'loc-starters':            { twa: /Just the top|^Regular$|\(Short\)/, short: /^Regular$|\(Short\)/, medium: /^Regular$|\(Short\)|\(Long\)/, long: /Long Hair|\(Long\)|Extra Long/ }
};

function build() {
  const { services } = require('../lib/seed-data.json');
  const out = { generatedFrom: 'lib/seed-data.json', lengthScale: LENGTH_SCALE, services: {} };
  for (const s of [...services].sort((a, b) => a.slug.localeCompare(b.slug))) {
    const bookable = s.variations.filter(v => v.bookable);
    const entry = {
      name: s.name,
      category: s.category,
      active: Boolean(s.active),
      from: s.price_from_cents == null ? null : s.price_from_cents,
      // [name, minutes]; options Square won't book online are left out, except
      // for a service with none, which the finder shows as "contact the studio".
      variations: (bookable.length ? bookable : s.variations).map(v => [v.name, v.duration_min])
    };
    const rules = LENGTH_RULES[s.slug];
    if (rules) {
      entry.len = {};
      for (const [k, re] of Object.entries(rules)) entry.len[k] = bookable.filter(v => re.test(v.name)).map(v => v.name);
    }
    out.services[s.slug] = entry;
  }
  return out;
}

const text = obj => JSON.stringify(obj, null, 1) + '\n';

if (require.main === module) {
  const next = text(build());
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== next) { console.error('public/data/finder-catalog.json is stale: run node scripts/build-finder-catalog.js'); process.exit(1); }
    console.log('finder catalog is up to date');
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, next);
    console.log('wrote', path.relative(process.cwd(), OUT));
  }
}

module.exports = { build, text, OUT, LENGTH_RULES, LENGTH_SCALE };
