// DELETE ?url=<blob url> → { ok } — remove a gallery photo or video.
// Requires the x-admin-key header. Uploads do NOT come through here: the
// admin page sends files straight to Blob storage via /api/upload, which
// avoids the serverless body-size limit and body-parsing of binary data.
const { del } = require('@vercel/blob');

function isAuthed(req) {
  const key = process.env.ADMIN_PASSWORD;
  return Boolean(key) && req.headers['x-admin-key'] === key;
}

// Accept any *_READ_WRITE_TOKEN, not just the default name (custom store
// prefixes rename it).
function blobToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const k = Object.keys(process.env).find(n => n.endsWith('_READ_WRITE_TOKEN'));
  return k ? process.env[k] : undefined;
}

module.exports = async (req, res) => {
  if (!isAuthed(req)) {
    res.status(401).json({ error: 'Not authorized' });
    return;
  }

  if (req.method === 'DELETE') {
    const url = req.query.url;
    if (!url || !url.includes('blob.vercel-storage.com')) {
      // Built-in /images/* photos aren't blobs — nothing to delete server-side.
      res.status(200).json({ ok: true, skipped: true });
      return;
    }
    try {
      await del(url, { token: blobToken() });
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
};
