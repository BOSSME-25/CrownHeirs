#!/usr/bin/env node
// Builds public/doll-maker/manifest.json from the Doll Maker's catalog in
// lib/dolls.js: every option id and display name, and the layer file each
// one will need when the drawn doll is replaced by painted layer art, named
// the way the developer handoff asks (chd_[base]_[category]_[option]_[variant]_v##.webp).
// The ids are the ones in the code and in share links, so art and code match.
//
//   node scripts/build-doll-manifest.js          write the file
//   node scripts/build-doll-manifest.js --check  exit 1 if it is stale
const fs = require('fs');
const path = require('path');
const D = require('../lib/dolls');

const OUT = path.join(__dirname, '..', 'public', 'doll-maker', 'manifest.json');
const u = s => String(s).replace(/-/g, '_');                       // filenames: lowercase, numbers, underscores only
const file = (base, cat, option, variant) => `chd_${[base, cat, u(option), variant && u(variant)].filter(Boolean).join('_')}_v01.webp`;
const bases = D.BASES.map(b => b.id);
const colorName = id => (D.GARMENT_COLORS.find(c => c.id === id) || {}).name;

function garments(cat, list) {
  return list.map(it => ({
    id: it.id, name: it.name.includes('{c}') ? it.name.replace('{c}', '[colour]') : it.name,
    ...(it.brand ? { brand: 'Crown Heirs mark placed from brand-source/brand_source_ch_monogram.png as its own layer' } : {}),
    colors: (it.colors || []).map(c => ({ id: c, name: colorName(c) })),
    files: bases.flatMap(b => (it.colors || [null]).map(c => file(b, cat, it.id, c)))
  }));
}

function build() {
  return {
    about: 'Crown Heirs Doll Maker layer manifest, generated from lib/dolls.js by scripts/build-doll-manifest.js. Do not edit by hand.',
    canvas: { master: '2400 x 3200 px PNG, transparent, sRGB', web: '1200 x 1600 px WebP (keep the PNG masters)', rule: 'Every layer uses the same 3:4 canvas, doll position and anchors. No cropping.' },
    naming: 'chd_[base]_[category]_[option]_[variant]_v##.webp',
    layers: ['background', 'base body / skin', 'facial detail (later)', 'hair back', 'bottom', 'top', 'shoes', 'hair front', 'accessories', 'approved brand overlays', 'foreground / throne']
      .map((name, i) => ({ z: String(i + 1).padStart(2, '0'), name })),
    brandSource: [
      { file: 'brand-source/brand_source_logo_primary.png', status: 'supplied', use: 'Reveal page and the Save & Share card' },
      { file: 'brand-source/brand_source_ch_monogram.png', status: 'supplied', use: 'Crown Heirs branded tops' },
      { file: 'brand-source/brand_source_crown_original.png', status: 'needed', use: 'The crown accessory (shown as coming soon until this file is supplied)' }
    ],
    bases: D.BASES.map(b => ({ id: b.id, name: b.name, defaults: b.defaults })),
    complexions: D.SHADES.map(s => ({ id: s.id, name: s.name, hex: s.hex, files: bases.map(b => file(b, 'skin', s.id)) })),
    hair: D.HAIR_STYLES.map(h => ({ id: h.id, name: h.name, files: bases.flatMap(b => ['back', 'front'].map(part => file(b, 'hair', h.id + '_' + part, '[colour]'))) })),
    hairColors: D.HAIR_COLORS.map(c => ({ id: c.id, name: c.name, hex: c.hex })),
    highlights: 'With highlights, every third strand is drawn in the second hair colour, root to tip.',
    tops: garments('top', D.TOPS),
    bottoms: garments('bottom', D.BOTTOMS),
    shoes: garments('shoes', D.SHOES),
    accessories: D.ACCESSORIES.map(a => ({ id: a.id, name: a.name, ...(a.available === false ? { status: 'coming soon' } : {}), ...(a.clashes ? { notWith: a.clashes } : {}),
      files: a.id === 'crown' ? ['brand-source/brand_source_crown_original.png'] : bases.map(b => file(b, 'acc', a.id)) })),
    backgrounds: D.BACKGROUNDS.map(b => ({ id: b.id, name: b.name, files: [file('all', 'bg', b.id)] }))
  };
}
const text = obj => JSON.stringify(obj, null, 1) + '\n';

if (require.main === module) {
  const next = text(build());
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== next) { console.error('public/doll-maker/manifest.json is stale: run node scripts/build-doll-manifest.js'); process.exit(1); }
    console.log('manifest is current');
  } else { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, next); console.log('wrote', path.relative(process.cwd(), OUT)); }
}
module.exports = { build, text, OUT };
