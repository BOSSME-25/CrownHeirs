// Client-upload token exchange for large files (videos).
// The admin page uploads straight from the phone/browser to Vercel Blob,
// bypassing the 4.5 MB serverless body limit; this endpoint only mints the
// short-lived upload token after checking the admin password (sent as
// clientPayload over HTTPS).
const { handleUpload } = require('@vercel/blob/client');

// Accept any *_READ_WRITE_TOKEN, not just the default name (custom store
// prefixes rename it).
function blobToken() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const k = Object.keys(process.env).find(n => n.endsWith('_READ_WRITE_TOKEN'));
  return k ? process.env[k] : undefined;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      token: blobToken(),
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const key = process.env.ADMIN_PASSWORD;
        if (!key || clientPayload !== key) {
          throw new Error('Not authorized');
        }
        return {
          allowedContentTypes: [
            'video/mp4', 'video/quicktime', 'video/webm',
            'image/jpeg', 'image/png', 'image/webp'
          ],
          maximumSizeInBytes: 100 * 1024 * 1024, // 100 MB — plenty for a ~60s clip
          addRandomSuffix: true
        };
      },
      // Fired by Blob after the browser finishes uploading; nothing to do —
      // the admin page adds the URL to content.json itself on Save.
      onUploadCompleted: async () => {}
    });
    res.status(200).json(jsonResponse);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
