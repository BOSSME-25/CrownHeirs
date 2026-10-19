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

// A TV's browser is often years behind a phone's. The page stays on CSS and
// DOM a 2019 browser knows for anything that decides whether a slide has a
// size at all, and a clip the browser refuses is skipped, not held black.
test('the page positions slides with the four offsets, not the newer inset shorthand', () => {
  const html = fs.readFileSync(TV, 'utf8');
  assert.ok(!/\binset\s*:/.test(html), 'inset: is unknown to older TV browsers and leaves a photo with no size');
  assert.ok(/if \(stage\.replaceChildren\) stage\.replaceChildren\(\.\.\.fresh\);/.test(html), 'replaceChildren has a fallback');
});

test('a clip the browser refuses is skipped: error on the <source>, or no frame after the grace period', () => {
  const html = fs.readFileSync(TV, 'utf8');
  assert.ok(/v\.querySelectorAll\('source'\)\.forEach\(s => s\.addEventListener\('error', skip/.test(html), 'the refusal arrives on the <source>');
  assert.ok(/if \(idx === next && \(v\.error \|\| v\.readyState < 2\)\) skip\(\);/.test(html), 'a clip with no frame is given up on');
  const grace = Number(html.match(/const VIDEO_GRACE_MS = (\d+);/)[1]);
  assert.ok(grace >= 3000 && grace <= 8000, 'long enough for a slow clip to start, short next to the 15-second hold');
});

test('uploaded photos are shown at screen width through the resizer; a refusal falls back to the original', () => {
  const buildSlides = loadBuildSlides();
  const els = buildSlides(content);
  const still = els.find((s) => /\bphoto\b/.test(s.className) && !/<video/.test(s.innerHTML));
  assert.match(still.innerHTML, /background-image:url\('\/_vercel\/image\?url=https%3A%2F%2Fblob\.example%2Fgallery%2Fa\.jpg&amp;w=1920&amp;q=80'\)/);
  const ig = els.find((s) => /\bigpost\b/.test(s.className));
  assert.match(ig.innerHTML, /src="\/_vercel\/image\?url=https%3A%2F%2Fblob\.example%2Fgallery%2Fd\.jpg&amp;w=1920&amp;q=80"/);
  // The built-in starter photos are local files and already small.
  const local = buildSlides({ settings: {}, gallery: [{ url: '/images/inspo/silk-press.jpg', caption: 'Silk Press' }] });
  assert.match(local[1].innerHTML, /background-image:url\('\/images\/inspo\/silk-press\.jpg'\)/);
  const html = fs.readFileSync(TV, 'utf8');
  assert.ok(/im\.onerror = \(\) => \{ unresized\.add\(g\.url\); res\(\); \};/.test(html), 'a refusal marks the photo to be shown unresized');
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  assert.deepEqual(cfg.images.sizes, [1920]);
  assert.ok(cfg.images.qualities.includes(80));
  assert.ok(cfg.images.remotePatterns.some((p) => /public\.blob\.vercel-storage\.com$/.test(p.hostname)), 'the Blob store is allowed');
});

test('the preload warms photos only, and no one photo can hold the show back', () => {
  const html = fs.readFileSync(TV, 'utf8');
  assert.ok(/\.filter\(g => !isVideo\(g\)\)\.map\(g => new Promise\(res => \{\s*const im = new Image\(\);[\s\S]{0,300}?setTimeout\(res, PRELOAD_CAP_MS\);/.test(html), 'clips are not preloaded as images, and each wait is capped');
  const cap = Number(html.match(/const PRELOAD_CAP_MS = (\d+);/)[1]);
  assert.ok(cap >= 3000 && cap <= 15000);
});
