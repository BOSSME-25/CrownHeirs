// POST { password } → { ok: true } if it matches ADMIN_PASSWORD.
// Used by /admin to gate the editor UI.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured) {
    res.status(500).json({ error: 'ADMIN_PASSWORD is not set on this Vercel project yet.' });
    return;
  }
  const { password } = req.body || {};
  if (password === configured) {
    res.status(200).json({ ok: true });
  } else {
    res.status(401).json({ error: 'Wrong password' });
  }
};
