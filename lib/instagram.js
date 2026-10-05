// "From the Den" straight from Instagram.
//
// Uses the Instagram API with Instagram Login (a professional account; the
// token comes from the Meta developer app, see README). Configured with
// INSTAGRAM_ACCESS_TOKEN. Without it, feed() returns no posts and the home
// page falls back to the TV gallery.
//
// A long-lived token lasts 60 days. While the site is being visited it is
// refreshed about weekly and the refreshed token kept in settings, so the
// env var only has to be set once (and again if the site sits unvisited for
// two months).
//
// Posts are sorted into the same categories the Services section uses, by
// the words in the caption and hashtags, so the home page can filter them.
let _fetch = (...a) => fetch(...a);

const GRAPH = 'https://graph.instagram.com';
const FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
const CACHE_MS = 10 * 60 * 1000;
const REFRESH_AFTER_MS = 7 * 24 * 3600 * 1000;

// Order matters: the first match names the primary category; every match is kept.
const CATEGORIES = [
  { name: 'Tiny Heirs',          words: ['tiny heir', 'tinyheir', 'kid', 'kids', 'child', 'children', 'toddler', 'little one', 'baby', 'teen', 'youth', 'son', 'daughter'] },
  { name: "Barber's Corner",     words: ['barber', 'fade', 'taper', 'line up', 'lineup', 'line-up', 'edge up', 'edgeup', 'beard', 'shape up', 'shapeup', 'mens cut', "men's cut", 'haircut for him'] },
  { name: 'Beauty',              words: ['lash', 'lashes', 'makeup', 'make up', 'make-up', 'wax', 'waxing', 'brow', 'brows', 'facial', 'glam'] },
  { name: 'Weaves & Extensions', words: ['sew in', 'sew-in', 'sewin', 'weave', 'extension', 'extensions', 'quick weave', 'quickweave', 'closure', 'frontal', 'wig', 'bundle', 'bundles', 'install'] },
  { name: 'Color & Chemical',    words: ['color', 'colour', 'colored', 'blonde', 'blond', 'balayage', 'highlight', 'highlights', 'relaxer', 'relaxed', 'perm', 'keratin', 'dye', 'dyed', 'bleach', 'copper', 'burgundy', 'honey blonde', 'red hair'] },
  { name: 'Locs',                words: ['loc', 'locs', 'locd', 'retwist', 're-twist', 'interlock', 'interlocking', 'starter', 'starters', 'sisterlock', 'sisterlocks', 'microloc', 'microlocs', 'dread', 'dreads', 'faux loc', 'faux locs', 'soft loc', 'soft locs', 'butterfly loc', 'instant loc', 'loc style', 'loc styles'] },
  { name: 'Braids & Twists',     words: ['braid', 'braids', 'braided', 'knotless', 'cornrow', 'cornrows', 'twist', 'twists', 'feed in', 'feed-in', 'feedin', 'boho', 'crochet', 'senegalese', 'box braid', 'box braids', 'fulani', 'tribal', 'lemonade', 'stitch braid', 'stitch braids', 'passion twist', 'passion twists', 'mini twist', 'mini twists'] },
  { name: 'Cuts & Styling',      words: ['silk press', 'silkpress', 'press', 'cut', 'pixie', 'bob', 'trim', 'blowout', 'blow out', 'blow dry', 'curl', 'curls', 'curly', 'wash and go', 'wash n go', 'ponytail', 'pony', 'updo', 'up-do', 'style', 'styled', 'natural', 'twist out', 'twistout', 'roller set', 'flat iron', 'sleek'] }
];
const ALL = CATEGORIES.map(c => c.name);

function words(text) {
  return ' ' + String(text || '').toLowerCase().replace(/#/g, ' ').replace(/[^a-z0-9'\s-]/g, ' ').replace(/\s+/g, ' ') + ' ';
}
// The categories a caption belongs to, primary first. A category matches on
// a whole word or phrase (so "cut" doesn't match "haircut"'s neighbour "cute"
// only by accident: "cute" is not " cut ").
function categorize(caption) {
  const w = words(caption);
  const out = [];
  for (const c of CATEGORIES) {
    if (c.words.some(x => w.includes(' ' + x + ' ') || w.includes(' ' + x + 's '))) out.push(c.name);
  }
  return out;
}

function shape(m) {
  const video = m.media_type === 'VIDEO';
  const url = video ? (m.thumbnail_url || m.media_url) : m.media_url;
  if (!url) return null;
  const caption = String(m.caption || '').trim();
  return {
    id: m.id, type: video ? 'video' : 'image', url, video: video ? m.media_url : null,
    caption: caption.split('\n')[0].slice(0, 140), full: caption.slice(0, 600),
    permalink: m.permalink || null, at: m.timestamp || null, categories: categorize(caption)
  };
}

async function api(path, params, token) {
  const u = new URL(GRAPH + path);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('access_token', token);
  const r = await _fetch(u.toString());
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Instagram ${r.status}: ${(j.error && (j.error.message || j.error.type)) || 'request failed'}`);
  return j;
}

// The newest token we know: a refreshed one kept in settings beats the env var
// it came from, but a new env var (different prefix) wins over a stale saved one.
async function currentToken() {
  const env = process.env.INSTAGRAM_ACCESS_TOKEN || '';
  if (!env) return { token: '', refreshedAt: 0 };
  try {
    const { query } = require('./db');
    const { rows } = await query(`SELECT key, value FROM settings WHERE key IN ('ig_token', 'ig_token_from', 'ig_token_refreshed_at')`);
    const s = Object.fromEntries(rows.map(r => [r.key, r.value]));
    if (s.ig_token && s.ig_token_from === env.slice(0, 12)) return { token: s.ig_token, refreshedAt: Number(s.ig_token_refreshed_at) || 0 };
  } catch (e) { /* no database: the env token is all there is */ }
  return { token: env, refreshedAt: 0 };
}

async function maybeRefresh(cur) {
  const env = process.env.INSTAGRAM_ACCESS_TOKEN || '';
  if (!cur.token || Date.now() - cur.refreshedAt < REFRESH_AFTER_MS) return cur.token;
  try {
    const j = await api('/refresh_access_token', { grant_type: 'ig_refresh_token' }, cur.token);
    const token = j.access_token || cur.token;
    try {
      const { query } = require('./db');
      const put = (k, v) => query(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [k, String(v)]);
      await put('ig_token', token); await put('ig_token_from', env.slice(0, 12)); await put('ig_token_refreshed_at', Date.now());
    } catch (e) { /* no database: still use the refreshed token this instance */ }
    return token;
  } catch (e) { return cur.token; }   // a failed refresh is not fatal while the old token still works
}

let cache = { at: 0, posts: null, error: null };

async function feed({ limit = 24, force = false } = {}) {
  if (!force && cache.posts && Date.now() - cache.at < CACHE_MS) return { posts: cache.posts.slice(0, limit), source: 'instagram', cached: true };
  const cur = await currentToken();
  if (!cur.token) return { posts: [], source: 'none' };
  const token = await maybeRefresh(cur);
  try {
    const j = await api('/me/media', { fields: FIELDS, limit: String(Math.min(50, Math.max(limit, 24))) }, token);
    const posts = (j.data || []).map(shape).filter(Boolean);
    cache = { at: Date.now(), posts, error: null };
    return { posts: posts.slice(0, limit), source: 'instagram' };
  } catch (e) {
    cache.error = e.message;
    if (cache.posts) return { posts: cache.posts.slice(0, limit), source: 'instagram', stale: true, error: e.message };
    return { posts: [], source: 'none', error: e.message };
  }
}

const configured = () => Boolean(process.env.INSTAGRAM_ACCESS_TOKEN);

module.exports = { feed, categorize, shape, configured, CATEGORIES: ALL, _setFetch: f => { _fetch = f; }, _reset: () => { cache = { at: 0, posts: null, error: null }; } };
