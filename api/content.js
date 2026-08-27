// GET  → the TV display content (public, read by /tv and /admin)
// POST → save new content (requires x-admin-key header)
//
// Content lives in Vercel Blob at data/content.json so Bethany's edits
// survive deploys. Until the first save, DEFAULT_CONTENT below is served.
const { put, list } = require('@vercel/blob');

const CONTENT_PATH = 'data/content.json';

const DEFAULT_CONTENT = {
  settings: { secondsPerSlide: 9, instagramHandle: 'crownheirs' },
  gallery: [
    { url: '/images/inspo/silk-press.jpg',    caption: 'Silk Press' },
    { url: '/images/inspo/natural-curls.jpg', caption: 'Natural Curls' },
    { url: '/images/inspo/braided-updo.jpg',  caption: 'Braided Updo' },
    { url: '/images/inspo/styled-locs.jpg',   caption: 'Styled Locs' }
  ],
  memberships: [
    {
      name: 'The Heir',
      price: '$—/mo',
      perks: ['One signature service each month', 'Priority booking', 'Member pricing on products']
    },
    {
      name: 'The Crown',
      price: '$—/mo',
      perks: ['Two services each month', 'Priority booking', 'Complimentary deep conditioning', 'Member pricing on products']
    }
  ],
  products: [
    { name: 'Ask us about our product line', price: '', blurb: 'Everything we use in the chair is available to take home.' }
  ],
  infoSlides: [
    {
      title: 'Welcome to The Den',
      body: 'Your throne awaits. Book your next appointment before you leave today and lock in your preferred time.'
    }
  ]
};

function isAuthed(req) {
  const key = process.env.ADMIN_PASSWORD;
  return Boolean(key) && req.headers['x-admin-key'] === key;
}

// The SDK looks for BLOB_READ_WRITE_TOKEN, but connecting a store with a
// custom prefix names it differently (e.g. MYSTORE_READ_WRITE_TOKEN) —
// accept whatever *_READ_WRITE_TOKEN this project has.
function blobToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const k = Object.keys(process.env).find(n => n.endsWith('_READ_WRITE_TOKEN'));
  return k ? process.env[k] : undefined;
}

function blobDiagnostic() {
  const names = Object.keys(process.env).filter(n => /BLOB|_READ_WRITE_TOKEN$/i.test(n));
  return names.length
    ? 'Storage-related env vars on this deployment: ' + names.join(', ')
    : 'No storage token env vars exist on this deployment — the Blob store is not connected to the crown-heirs project (or no redeploy has happened since connecting).';
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: CONTENT_PATH, limit: 1, token: blobToken() });
      if (blobs.length > 0) {
        const r = await fetch(blobs[0].url + '?t=' + Date.now(), { cache: 'no-store' });
        if (r.ok) {
          res.setHeader('Cache-Control', 'no-store');
          res.status(200).json(await r.json());
          return;
        }
      }
    } catch (e) {
      // Blob store not linked yet, or transient error — fall through to defaults.
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(DEFAULT_CONTENT);
    return;
  }

  if (req.method === 'POST') {
    if (!isAuthed(req)) {
      res.status(401).json({ error: 'Not authorized' });
      return;
    }
    const content = req.body;
    if (!content || typeof content !== 'object' || !Array.isArray(content.gallery)) {
      res.status(400).json({ error: 'Invalid content payload' });
      return;
    }
    try {
      await put(CONTENT_PATH, JSON.stringify(content), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
        token: blobToken()
      });
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'Could not save. ' + blobDiagnostic() + ' (' + e.message + ')' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
