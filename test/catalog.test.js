// The catalog file is generated from the Square export; guard its shape so a
// bad regeneration can't ship. Runs without a database.
const test = require('node:test');
const assert = require('node:assert/strict');
const { services } = require('../lib/seed-data.json');

test('catalog: every service has a unique slug and at least one variation', () => {
  const slugs = services.map(s => s.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.ok(services.length >= 60);
  for (const s of services) {
    assert.ok(s.variations.length >= 1, s.name);
    assert.ok(s.category && typeof s.sort === 'number');
    for (const v of s.variations) assert.ok(v.duration_min > 0 && v.name, `${s.name} / ${v.name}`);
  }
});

test('catalog: active ⇔ has a bookable variation; duration is the shortest bookable one', () => {
  for (const s of services) {
    const bookable = s.variations.filter(v => v.bookable);
    assert.equal(s.active, bookable.length > 0, s.name);
    if (bookable.length) assert.equal(s.duration_min, Math.min(...bookable.map(v => v.duration_min)), s.name);
  }
});

test('catalog: spot-checks against the export', () => {
  const by = Object.fromEntries(services.map(s => [s.slug, s]));
  assert.equal(by['loc-retwist'].variations.length, 6);
  assert.equal(by['loc-retwist'].variations.find(v => v.name === 'New Client').duration_min, 90);
  assert.equal(by['braids-knotless'].variations.length, 12);
  assert.equal(by['braids-knotless'].price_from_cents, 17500, 'site price carried over via alias');
  assert.equal(by['threading'].active, false, 'entirely not-bookable-online');
  assert.equal(by['consultations'].buffer_min, 0);
  assert.ok(by['color'].requires_consult);
});
