// The TV slideshow's slide order, run from public/tv.html itself.
//
//   node --test test/tv.test.js
//
// The page's script is lifted out of the HTML and run against a stub DOM
// just rich enough for buildSlides. The governing property: every slot in
// the loop is its own element. The same element in two slots left the
// first one black for the whole hold — a DOM node lives in one place — and
// with five gallery items against twelve text slides that was most of the
// loop. A video comes round once per loop; a photo may come round again.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const TV = process.env.TV_HTML || path.join(__dirname, '..', 'public', 'tv.html');

function loadBuildSlides() {
  const html = fs.readFileSync(TV, 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)[1];
  const el = (tag) => ({
    tag, className: '', innerHTML: '', style: {}, textContent: '',
    classList: { remove() {}, add() {}, toggle() {} },
    querySelector() { return el('div'); }, querySelectorAll() { return []; },
    addEventListener() {}, replaceChildren() {},
  });
  const sandbox = {
    document: { createElement: el, getElementById: () => el('div'), addEventListener() {} },
    window: {}, navigator: {}, Image: function () {}, Intl, Date, JSON, Math, Set, String, Number, URL, isFinite, encodeURIComponent,
    setTimeout() { return 0; }, setInterval() { return 0; }, clearTimeout() {},
    fetch: () => Promise.reject(new Error('offline')),
    console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script + '\n;this.__build = buildSlides;', sandbox);
  return sandbox.__build;
}

const blob = (n, ext) => `https://blob.example/gallery/${n}.${ext}`;
const content = {
  settings: { instagramHandle: 'crownheirs', showServices: true },
  gallery: [
    { url: blob('a', 'jpg'), caption: 'Loc Maintenance' },
    { url: blob('b', 'mov'), caption: 'Knotless', type: 'video' },
    { url: blob('c', 'jpg'), caption: 'Miracle Knots' },
    { url: blob('d', 'jpg'), caption: 'Doll', ig: true },
    { url: blob('e', 'mov'), caption: 'Pixie', type: 'video' },
  ],
  memberships: [{ name: 'Loyalty', price: '$140/mo', perks: ['Retwist'] }],
  products: [{ name: 'Crown Oil', price: '$20', blurb: 'Seal it.' }],
  infoSlides: Array.from({ length: 8 }, (_, i) => ({ title: `Note ${i + 1}`, body: 'Ask us.' })),
};

const isPhoto = (s) => /\b(photo|igpost)\b/.test(s.className);
const isVideo = (s) => /<video/.test(s.innerHTML);

test('every slot in the loop is its own element — nothing is ever black', () => {
  const buildSlides = loadBuildSlides();
  const els = buildSlides(content);
  assert.equal(new Set(els).size, els.length, 'the same element appears in two slots');
});

test('two photos sit between text slides even when the gallery is short', () => {
  const els = loadBuildSlides()(content);
  const text = els.filter((s) => !isPhoto(s) && !/welcome/.test(s.className));
  assert.equal(text.length, 11, 'memberships, products, eight notes and follow-us');
  const photos = els.filter(isPhoto);
  assert.ok(photos.length >= 2 * text.length - 2, `only ${photos.length} photo slots for ${text.length} text slides`);
  // The first text slide is preceded by the welcome and two photos.
  assert.ok(isPhoto(els[1]) && isPhoto(els[2]) && !isPhoto(els[3]));
});

test('a video comes round once per loop; a photo may come round again', () => {
  const els = loadBuildSlides()(content);
  const videos = els.filter(isVideo);
  assert.equal(videos.length, 2, 'each clip once');
  const stills = els.filter((s) => isPhoto(s) && !isVideo(s));
  assert.ok(stills.length > 3, 'the three stills come round more than once');
});

test('with no text slides the photos play once each', () => {
  const els = loadBuildSlides()({ settings: {}, gallery: content.gallery });
  assert.equal(els.length, 1 + content.gallery.length);
  assert.equal(new Set(els).size, els.length);
});

test('an empty gallery still gives the text slides', () => {
  const els = loadBuildSlides()({ ...content, gallery: [] });
  assert.ok(els.length >= 11 && els.every((s) => !isPhoto(s)));
});
