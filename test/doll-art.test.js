const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../lib/doll-catalog');
require('../public/doll-art');
const A = globalThis.DollArt;

test('every hairstyle and garment renders with defined paints and isolated SVG ids', () => {
  for (const style of D.HAIR_STYLES) for (const top of D.TOPS) {
    const svg = A.render({base:'boy',skin:'#b37a4c',hair1:'#1b1b1b',hair2:'#c9963e',style:style.id,top:{look:top.look,color:'#e58fb0',brand:top.brand},bottom:{look:'jeans',color:'#4a6a94'},shoes:{look:'sneakers',main:'#1f1d1b',trim:'#f7f4ee'},accessories:['glasses']}, 'check');
    assert.ok(!/undefined|NaN/.test(svg));
    const ids = [...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
    assert.equal(new Set(ids).size, ids.length);
    for (const m of svg.matchAll(/url\(#([^)]*)\)/g)) assert.ok(ids.includes(m[1]), m[1]);
  }
});

test('head tiles carry the same yarn nose and reflective eyes as the full doll', () => {
  const tile=A.tile('locs','#1b1b1b',null,'#7d4a2c','tile');
  assert.match(tile, /fill="#090807"/);
  assert.ok(!/undefined|NaN/.test(tile));
});
