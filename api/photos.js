// POST   ?filename=foo.jpg  (body: raw image bytes) → { url } — upload a gallery photo
// DELETE ?url=<blob url>                             → { ok }  — remove a photo
// Both require the x-admin-key header. Images are stored in Vercel Blob
// under gallery/. The admin page resizes photos client-side before upload,
// so files stay well under the 4.5 MB serverless body limit.
const { put, del } = require('@vercel/blob');

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

  if (req.method === 'POST') {
    const filename = (req.query.filename || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
    const body = req.body;
    if (!body || !body.length) {
      res.status(400).json({ error: 'Empty upload' });
      return;
    }
    try {
      const blob = await put('gallery/' + filename, body, {
        access: 'public',
        contentType: req.headers['content-type'] || 'image/jpeg',
        addRandomSuffix: true,
        token: blobToken()
      });
      res.status(200).json({ url: blob.url });
    } catch (e) {
      res.status(500).json({ error: 'Upload failed. Is the Blob store connected? (' + e.message + ')' });
    }
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
