// The homepage finder hands off to /book via BOOK_MAP embedded in index.html.
// Guard that every entry still points at a real, bookable catalog item and
// that no Square booking link survives. No database needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const { services } = require('../lib/seed-data.json');
const bySlug = Object.fromEntries(services.map(s => [s.slug, s]));

function bookMap() {
  const m = html.match(/const BOOK_MAP=(\{[\s\S]*?\});\n/);
  assert.ok(m, 'BOOK_MAP present in index.html');
  return JSON.parse(m[1]);
}

test('finder: every mapped label points at an active service (and a bookable option, when named)', () => {
  const map = bookMap();
  assert.ok(Object.keys(map).length >= 60);
  for (const [label, m] of Object.entries(map)) {
    const s = bySlug[m.slug];
    assert.ok(s && s.active, `${label} → ${m.slug} must be an active service`);
    assert.equal(m.name, s.name, `${label}: display name is Square's`);
    if (m.variation) {
      const v = s.variations.find(x => x.name === m.variation);
      assert.ok(v && v.bookable, `${label} → ${m.slug} / ${m.variation} must be a bookable option`);
    }
  }
});

test('finder: no Square booking links remain; cards book on this site', () => {
  assert.doesNotMatch(html, /squareup\.com/);
  assert.doesNotMatch(html, /SQUARE_BASE|BOOKING_URLS/);
  assert.match(html, /getBookingUrl\(name\)[\s\S]*?'\/book\?service='/);
  assert.ok((html.match(/href="\/book"/g) || []).length >= 10, 'browse/book buttons go to /book');
  assert.ok((html.match(/sqLabel\(/g) || []).length >= 6, 'card labels go through sqLabel');
});
