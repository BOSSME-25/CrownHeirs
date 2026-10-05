// Instagram feed: category sorting from captions, the fetch and its cache,
// the no-token case, and the handler. No database, Instagram stubbed.
const test = require('node:test');
const assert = require('node:assert/strict');
const ig = require('../lib/instagram');
const handler = require('../api/instagram');

const res = () => ({ statusCode: 200, headers: {}, body: undefined, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; } });

test('categorize: captions and hashtags land in the service categories, primary first', () => {
  assert.deepEqual(ig.categorize('Fresh retwist and style for the weekend #locs #locstyles'), ['Locs', 'Cuts & Styling']);
  assert.deepEqual(ig.categorize('Knotless boho braids, 24 inches'), ['Braids & Twists']);
  assert.deepEqual(ig.categorize('Silk press on natural hair ✨'), ['Cuts & Styling']);
  assert.deepEqual(ig.categorize('Tiny Heirs first cut! #kids'), ['Tiny Heirs', 'Cuts & Styling']);
  assert.deepEqual(ig.categorize('Clean taper fade and beard line up'), ["Barber's Corner"]);
  assert.deepEqual(ig.categorize('Honey blonde color on a sew-in'), ['Weaves & Extensions', 'Color & Chemical']);
  assert.deepEqual(ig.categorize('Full set of lashes'), ['Beauty']);
  assert.deepEqual(ig.categorize('Cute day at the Den'), [], '"cute" is not "cut"');
  assert.deepEqual(ig.categorize(''), []);
  assert.equal(ig.CATEGORIES.length, 8);
});

test('feed: no token means no posts and no call', async () => {
  delete process.env.INSTAGRAM_ACCESS_TOKEN; ig._reset();
  let called = 0; ig._setFetch(async () => { called++; return { ok: true, json: async () => ({}) }; });
  const f = await ig.feed();
  assert.deepEqual(f, { posts: [], source: 'none' }); assert.equal(called, 0);
  const r = res(); await handler({ method: 'GET', query: {} }, r);
  assert.equal(r.statusCode, 200); assert.equal(r.body.configured, false); assert.deepEqual(r.body.posts, []); assert.equal(r.headers['Cache-Control'], 'no-store');
});

test('feed: posts are shaped (videos show their thumbnail), categorised, cached; a failing refresh is ignored', async () => {
  process.env.INSTAGRAM_ACCESS_TOKEN = 'IGQVJtest-token'; ig._reset();
  const calls = [];
  ig._setFetch(async (u) => {
    calls.push(u);
    if (/refresh_access_token/.test(u)) return { ok: false, status: 400, json: async () => ({ error: { message: 'nope' } }) };
    assert.match(u, /\/me\/media\?/); assert.match(u, /access_token=IGQVJtest-token/);
    return { ok: true, status: 200, json: async () => ({ data: [
      { id: '1', caption: 'Knotless braids for the summer #braids', media_type: 'IMAGE', media_url: 'https://cdn/1.jpg', permalink: 'https://instagram.com/p/1', timestamp: '2026-10-01T00:00:00+0000' },
      { id: '2', caption: 'Retwist reel\nmore text', media_type: 'VIDEO', media_url: 'https://cdn/2.mp4', thumbnail_url: 'https://cdn/2.jpg', permalink: 'https://instagram.com/p/2' },
      { id: '3', caption: 'no media', media_type: 'IMAGE' }
    ] }) };
  });
  const f = await ig.feed({ limit: 10 });
  assert.equal(f.source, 'instagram'); assert.equal(f.posts.length, 2);
  assert.deepEqual(f.posts[0].categories, ['Braids & Twists']); assert.equal(f.posts[0].permalink, 'https://instagram.com/p/1');
  assert.equal(f.posts[1].type, 'video'); assert.equal(f.posts[1].url, 'https://cdn/2.jpg'); assert.equal(f.posts[1].video, 'https://cdn/2.mp4'); assert.equal(f.posts[1].caption, 'Retwist reel'); assert.deepEqual(f.posts[1].categories, ['Locs']);
  const n = calls.length;
  const again = await ig.feed({ limit: 1 });
  assert.equal(again.cached, true); assert.equal(again.posts.length, 1); assert.equal(calls.length, n, 'served from cache');
  const r = res(); await handler({ method: 'GET', query: { limit: '1' } }, r);
  assert.equal(r.body.posts.length, 1); assert.equal(r.body.configured, true); assert.match(r.headers['Cache-Control'], /s-maxage=600/);
  delete process.env.INSTAGRAM_ACCESS_TOKEN; ig._setFetch((...a) => fetch(...a)); ig._reset();
});

test('feed: an Instagram error with nothing cached yields no posts and the message', async () => {
  process.env.INSTAGRAM_ACCESS_TOKEN = 'IGQVJbad'; ig._reset();
  ig._setFetch(async (u) => /refresh/.test(u) ? { ok: false, status: 400, json: async () => ({}) } : { ok: false, status: 190, json: async () => ({ error: { message: 'Invalid OAuth access token' } }) });
  const f = await ig.feed();
  assert.equal(f.source, 'none'); assert.deepEqual(f.posts, []); assert.match(f.error, /Invalid OAuth/);
  delete process.env.INSTAGRAM_ACCESS_TOKEN; ig._setFetch((...a) => fetch(...a)); ig._reset();
});
