// The Option 3 exporter (scripts/export-option3-library.js): one image per
// base, complexion, hair, top, bottom and shoes, for store listings. Guard the
// counts, the names, the listing words and links, the SVG it renders, and that
// a dry run writes nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const X = require('../scripts/export-option3-library');
const D = require('../lib/doll-catalog');

test('every combination is counted: 1,440 batches of 2,565', () => {
  assert.deepEqual([X.TOPS.length, X.BOTTOMS.length, X.SHOES.length, X.PER_BATCH], [15, 19, 9, 2565]);
  assert.equal(X.batchesFor({}).length, 2 * 5 * 12 * 12);
  assert.equal(X.batchesFor({ base: 'boy', style: 'locs' }).length, 5 * 12);
  assert.throws(() => X.batchesFor({ shade: 'neon' }), /Unknown shade/);
});

test('one batch has a unique, readable name per image', () => {
  const rows = X.rowsFor({ base: 'girl', shade: 'caramel', style: 'locs', hairColor: 'black' });
  const stems = rows.map(X.stemOf);
  assert.equal(new Set(stems).size, 2565);
  assert.ok(stems.every(s => /^girl_caramel_locs_black_[a-z0-9-]+_[a-z0-9-]+_[a-z0-9-]+$/.test(s)));
  assert.ok(stems.includes('girl_caramel_locs_black_tee-yellow_skirt-pink_boots-brown'));
});

test('each image gets a listing title and a link that reopens the same look', () => {
  const row = X.rowsFor({ base: 'boy', shade: 'deep-brown', style: 'short-curls', hairColor: 'auburn' }).find(r => r.top.id === 'ch-sweater' && r.bottom.token === 'jeans-black' && r.shoes.id === 'sneakers-white');
  assert.equal(X.titleOf(row), 'Deep Brown boy, auburn short curls / fade · Royal blue Crown Heirs sweater, Black jeans, White sneakers');
  const u = new URL(X.lookUrl(row));
  assert.equal(u.pathname, '/dolls');
  assert.deepEqual(Object.fromEntries(u.searchParams), { b: 'boy', c: 'deep-brown', h: 'short-curls', hc: 'auburn', t: 'ch-sweater.royal', p: 'jeans.black', s: 'sneakers-white', step: 'reveal' });
  for (const [k, list] of [['t', D.TOPS], ['p', D.BOTTOMS], ['s', D.SHOES]]) assert.ok(list.some(x => x.id === u.searchParams.get(k).split('.')[0]), k);
});

test('the SVG is full size, has no highlights or accessories, and embeds the CH mark from its file', () => {
  const rows = X.rowsFor({ base: 'girl', shade: 'caramel', style: 'locs', hairColor: 'black' });
  const branded = X.svgOf(rows.find(r => r.top.id === 'ch-hoodie')), plain = X.svgOf(rows.find(r => r.top.id === 'tee'));
  assert.match(branded, /viewBox="0 0 200 290" width="200" height="290"/);
  assert.match(branded, /<image xlink:href="data:image\/png;base64,/);
  assert.ok(!/<image href="\//.test(branded), 'no links back to the site');
  assert.ok(!/<image /.test(plain), 'no crown or other mark without a branded top');
  assert.ok(!branded.includes('-hl)'), 'no highlight paint');
});

test('a dry run counts and writes nothing', () => {
  const out = path.join(os.tmpdir(), 'option3-dry-' + process.pid);
  const said = execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'export-option3-library.js'), '--dry-run', '--base', 'girl', '--out', out], { encoding: 'utf8' });
  assert.match(said, /batches: 720/); assert.match(said, /total: 1,846,800/);
  assert.equal(fs.existsSync(out), false);
});
