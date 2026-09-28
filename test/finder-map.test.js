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

test('finder: service photos exist, belong to catalog services, and cover the cards', () => {
  const m = html.match(/const SVC_PHOTOS=new Set\((\[[\s\S]*?\])\);/);
  assert.ok(m, 'SVC_PHOTOS present in index.html');
  const photos = JSON.parse(m[1]);
  const dir = path.join(__dirname, '..', 'public', 'images', 'services');
  for (const slug of photos) {
    assert.ok(bySlug[slug], `${slug}.jpg must be named after a catalog service`);
    const f = path.join(dir, slug + '.jpg');
    assert.ok(fs.existsSync(f), `${slug}.jpg exists`);
    assert.ok(fs.statSync(f).size < 150 * 1024, `${slug}.jpg is web-sized`);
  }
  const onDisk = fs.readdirSync(dir).filter(f => f.endsWith('.jpg')).map(f => f.slice(0, -4)).sort();
  assert.deepEqual(onDisk, [...photos].sort(), 'every photo on disk is listed, and vice versa');
  const used = [...new Set(Object.values(bookMap()).map(v => v.slug))];
  const covered = used.filter(s => photos.includes(s));
  assert.ok(covered.length >= used.length - 2, `most finder services have a photo (${covered.length}/${used.length})`);
  assert.ok((html.match(/svcVis\('/g) || []).length >= 5, 'every tile renderer uses the photo helper');
});

test('finder: every photo the tiles reference exists (static paths and goal img slugs)', () => {
  const dir = path.join(__dirname, '..', 'public', 'images');
  const refs = [
    ...[...html.matchAll(/\/images\/(services|length)\/([a-z0-9-]+)\.jpg/g)].map(m => `${m[1]}/${m[2]}.jpg`),
    ...[...html.matchAll(/\bimg:'([a-z0-9-]+)'/g)].map(m => `services/${m[1]}.jpg`)
  ];
  assert.ok(refs.length >= 30, 'tiles reference photos');
  const missing = [...new Set(refs)].filter(r => !fs.existsSync(path.join(dir, r)));
  assert.deepEqual(missing, [], 'no tile points at a missing photo');
});

test('tv: the services list names real, active services that have a photo', () => {
  const dir = path.join(__dirname, '..', 'public', 'images', 'services');
  const list = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  assert.ok(list.length >= 40, 'most of the menu is on the TV');
  assert.equal(new Set(list.map(s => s.slug)).size, list.length, 'no service twice');
  for (const s of list) {
    const c = bySlug[s.slug];
    assert.ok(c && c.active, `${s.slug} is an active service`);
    assert.equal(s.name, c.name, `${s.slug}: Square's name`);
    assert.ok(fs.existsSync(path.join(dir, s.slug + '.jpg')), `${s.slug}.jpg exists`);
  }
  const first6 = new Set(list.slice(0, 6).map(s => s.category));
  assert.ok(first6.size >= 4, 'each screenful mixes categories');
});

test('finder: no Square booking links remain; cards book on this site', () => {
  assert.doesNotMatch(html, /squareup\.com/);
  assert.doesNotMatch(html, /SQUARE_BASE|BOOKING_URLS/);
  assert.match(html, /getBookingUrl\(name\)[\s\S]*?'\/book\?service='/);
  assert.ok((html.match(/href="\/book"/g) || []).length >= 10, 'browse/book buttons go to /book');
  assert.ok((html.match(/sqLabel\(/g) || []).length >= 6, 'card labels go through sqLabel');
});
