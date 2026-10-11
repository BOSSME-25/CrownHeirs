#!/usr/bin/env node
// Exports the Doll Maker's drawn doll as standalone SVG files, one per option,
// for designers: each file opens in a browser, Illustrator or Figma with the
// doll's layers as named groups (01 background … 10 brand overlay), and the
// Crown Heirs marks embedded from their source files so nothing is missing.
//
//   node scripts/export-doll-svgs.js [outDir]     (default: ./doll-svg-export)
const fs = require('fs');
const path = require('path');
const D = require('../lib/doll-catalog');
require('../public/doll-art.js');
const A = globalThis.DollArt;

const ROOT = path.join(__dirname, '..', 'public');
const OUT = path.resolve(process.argv[2] || 'doll-svg-export');
const byId = (list, id) => list.find(x => x.id === id);
const hex = id => (byId(D.GARMENT_COLORS, id) || {}).hex;

// The same option → drawing mapping the page uses.
function garment(list, id, color) {
  const it = byId(list, id), c = hex(color || (it.colors || [])[0]);
  return { look: it.look, color: c, brand: !!it.brand, main: it.main || c, trim: it.trim || it.main || c };
}
function doll(pick) {
  const p = Object.assign({ base: 'girl', shade: 'warm-brown' }, byId(D.BASES, pick.base || 'girl').defaults, pick);
  return { base: p.base, skin: byId(D.SHADES, p.shade).hex, hair1: byId(D.HAIR_COLORS, p.hairColor).hex, hair2: p.hairColor2 ? byId(D.HAIR_COLORS, p.hairColor2).hex : null,
    style: p.hairStyle, top: garment(D.TOPS, p.top, p.topColor), bottom: garment(D.BOTTOMS, p.bottom, p.bottomColor), shoes: garment(D.SHOES, p.shoes, p.shoesColor), accessories: p.accessories || [] };
}
// Brand files go in as data URIs (both href forms, for older design tools).
const embedded = {};
function embed(svg) {
  return svg.replace(/<image href="([^"]+)"/g, (m, src) => {
    if (!embedded[src]) embedded[src] = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, src)).toString('base64');
    return `<image xlink:href="${embedded[src]}" href="${embedded[src]}"`;
  });
}
function write(rel, title, viewBox, body) {
  const [, , w, h] = viewBox.split(' ').map(Number);
  const file = path.join(OUT, rel); fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${viewBox}" width="${w * 5}" height="${h * 5}">\n<title>${title}</title>\n${embed(body)}\n</svg>\n`);
  return rel;
}
const DOLL = '0 0 200 290';
const files = [];
for (const b of D.BASES) files.push(write(`bases/doll-${b.id}.svg`, `${b.name} base, its starting look`, DOLL, A.render(doll({ base: b.id }), 'doll')));
for (const s of D.SHADES) files.push(write(`complexions/doll-${s.id}.svg`, `${s.name} complexion`, DOLL, A.render(doll({ shade: s.id }), 'doll')));
for (const h of D.HAIR_STYLES) files.push(write(`hair/hair-${h.id}.svg`, `${h.name}, black`, DOLL, A.render(doll({ base: h.id === 'short-curls' ? 'boy' : 'girl', hairStyle: h.id }), 'doll')));
files.push(write('hair/hair-locs-with-highlights.svg', 'Locs, black with honey blonde highlights', DOLL, A.render(doll({ hairColor2: 'honey-blonde' }), 'doll')));
for (const [dir, list, key] of [['tops', D.TOPS, 'top'], ['bottoms', D.BOTTOMS, 'bottom'], ['shoes', D.SHOES, 'shoes']])
  for (const it of list) files.push(write(`${dir}/${key}-${it.id}.svg`, D.itemName(list, it.id), DOLL, A.render(doll({ [key]: it.id, [key + 'Color']: null }), 'doll')));
for (const a of D.ACCESSORIES) files.push(write(`accessories/acc-${a.id}.svg`, a.name, DOLL, A.render(doll({ hairStyle: (a.clashes || []).includes('locs') ? 'loose-curls' : 'locs', accessories: [a.id] }), 'doll')));
for (const bg of D.BACKGROUNDS) files.push(write(`reveal/reveal-${bg.id}.svg`, `${bg.name} reveal`, '0 0 300 380', A.reveal(doll({}), bg.id, 'reveal')));
console.log(`wrote ${files.length} SVGs to ${path.relative(process.cwd(), OUT) || '.'}`);
