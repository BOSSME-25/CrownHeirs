// GET ?text=<url> → QR code as SVG.
// Rendered server-side so the TV needs no client-side library: a display that
// has to run unattended all day shouldn't depend on a CDN to draw a QR code.
const QRCode = require('qrcode');

module.exports = async (req, res) => {
  const text = String(req.query.text || '').trim();
  if (!text) {
    res.status(400).json({ error: 'Provide ?text=' });
    return;
  }
  if (text.length > 512) {
    res.status(400).json({ error: 'Text too long (max 512 characters)' });
    return;
  }
  try {
    const svg = await QRCode.toString(text, {
      type: 'svg',
      margin: 1,                    // quiet zone — needed for reliable scanning
      errorCorrectionLevel: 'M',
      color: { dark: '#14120f', light: '#ffffff' }
    });
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.status(200).send(svg);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
