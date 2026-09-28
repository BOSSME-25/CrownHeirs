// The finder's prices and times come from public/data/finder-catalog.json,
// generated from the Square catalog export. Guard that it is current, that
// every length rule lands on real options, and that every card resolves.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { build, text, OUT, LENGTH_RULES } = require('../scripts/build-finder-catalog');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const bookMap = JSON.parse(html.match(/const BOOK_MAP=(\{[\s\S]*?\});\n/)[1]);
const catalog = JSON.parse(fs.readFileSync(OUT, 'utf8'));

test('catalog file is current with lib/seed-data.json (run scripts/build-finder-catalog.js)', () => {
  assert.equal(fs.readFileSync(OUT, 'utf8'), text(build()));
});

test('every length rule picks at least one bookable option, for every length it names', () => {
  for (const [slug, rules] of Object.entries(LENGTH_RULES)) {
    const s = catalog.services[slug];
    assert.ok(s && s.active, `${slug} is an active service`);
    for (const k of Object.keys(rules)) {
      assert.ok(['twa', 'short', 'medium', 'long'].includes(k), `${slug}: ${k} is a finder length`);
      assert.ok(s.len[k].length > 0, `${slug} has options for ${k}`);
      for (const n of s.len[k]) assert.ok(s.variations.some(v => v[0] === n), `${slug}: ${n} is a bookable option`);
    }
  }
});

test('every finder card resolves to a catalog service with times; contact-only cards are not bookable online', () => {
  for (const [label, m] of Object.entries(bookMap)) {
    const s = catalog.services[m.slug];
    assert.ok(s && s.active && s.variations.length, `${label} → ${m.slug}`);
    if (m.variation) assert.ok(s.variations.some(v => v[0] === m.variation), `${label}: ${m.variation} has a time`);
  }
  const contact = JSON.parse(html.match(/const CONTACT_ONLY=(\{[^}]*\});/)[1].replace(/'/g, '"'));
  for (const [label, slug] of Object.entries(contact)) {
    assert.equal(catalog.services[slug].active, false, `${label} is contact-the-studio in Square`);
    assert.ok(!bookMap[label], `${label} has no online booking link`);
  }
});

test('the review\'s two wrong mappings stay fixed', () => {
  assert.equal(bookMap['Freeform Locs'].slug, 'consultations', 'freeform books a loc consult, not a retwist');
  assert.equal(bookMap['Freeform Locs'].variation, 'Loc Consult');
  assert.ok(!bookMap['Perimeter Touch Up'], 'the braid touch-up never opens a relaxer');
});
