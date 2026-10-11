// The Doll Maker's layer manifest is generated from the catalog in
// lib/dolls.js. Guard that it is current and that its filenames follow the
// handoff's naming rule, and that the page and art never draw a crown.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { build, text, OUT } = require('../scripts/build-doll-manifest');

test('manifest is current with lib/doll-catalog.js (run scripts/build-doll-manifest.js)', () => {
  assert.equal(fs.readFileSync(OUT, 'utf8'), text(build()));
});

test('every layer filename is lowercase letters, numbers and underscores', () => {
  const m = build(), files = [];
  for (const k of ['complexions', 'hair', 'tops', 'bottoms', 'shoes', 'accessories', 'backgrounds']) for (const o of m[k]) files.push(...o.files);
  const art = files.filter(f => !f.startsWith('brand-source/'));
  assert.ok(art.length > 100);
  for (const f of art) assert.match(f, /^chd_[a-z0-9_\[\]]+_v\d\d\.webp$/, f);
  assert.ok(!art.some(f => f.includes('-') || f.includes(' ')));
});

test('the supplied brand files exist, under their source names', () => {
  for (const b of build().brandSource.filter(b => b.status === 'supplied')) assert.ok(fs.existsSync(path.join(path.dirname(OUT), b.file)), b.file);
});

test('no Crown Heirs crown or mark is drawn: marks are placed from their source files only', () => {
  require('../public/doll-art.js'); const A = globalThis.DollArt;
  const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'doll-art.js'), 'utf8');
  assert.ok(!/l1\.8 -9 l4 5|l3 -15 l6\.5 8/.test(src), 'the old drawn crowns are gone');
  const D = require('../lib/doll-catalog');
  const MONO = '/doll-maker/brand-source/brand_source_ch_monogram.png', CROWN = '/doll-maker/brand-source/brand_source_crown_original.png';
  const hrefs = svg => (svg.match(/<image [^>]*>/g) || []).map(i => i.match(/href="([^"]+)"/)[1]);
  for (const t of D.TOPS) for (const acc of [[], ['crown'], D.ACCESSORIES.map(a => a.id).filter(a => a !== 'crown')]) {
    const got = hrefs(A.render({ base: 'girl', style: 'locs', top: { look: t.look, color: '#e58fb0', brand: !!t.brand }, accessories: acc }, 'x'));
    assert.deepEqual(got, [...(t.brand ? [MONO] : []), ...(acc.includes('crown') ? [CROWN] : [])], `${t.id} with ${acc.join(',') || 'nothing'}`);
  }
  for (const bg of ['throne', 'neutral']) assert.equal(hrefs(A.reveal({}, bg, 'z')).length, 0, bg + ': settings carry no marks');
});

test('the catalog loads on its own, with no server code, so the scripts and preview run anywhere', () => {
  const { execFileSync } = require('child_process');
  const out = execFileSync(process.execPath, ['-e', `require(${JSON.stringify(path.join(__dirname, '..', 'lib', 'doll-catalog.js'))});
    console.log(JSON.stringify(Object.keys(require.cache).map(k => require('path').basename(k))))`], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(out), ['doll-catalog.js']);
});

// Skipped in the standalone Doll Maker package, which has no database code.
test('the API serves the catalog\'s choices', { skip: !fs.existsSync(path.join(__dirname, '..', 'lib', 'db.js')) && 'needs the full site repo' }, () => {
  assert.deepEqual(require('../lib/doll-catalog').options(), require('../lib/dolls').options());
});
