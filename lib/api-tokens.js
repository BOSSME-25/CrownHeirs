// Per-integration credentials with named scopes. The token itself is shown
// once at creation; only its sha256 is stored. Reads only — nothing here
// grants a write.
const crypto = require('crypto');
const { query } = require('./db');
const { BookingError } = require('./booking');

const SCOPES = ['appointments:read', 'tickets:read', 'catalog:read', 'schedule:read', 'employees:read', 'clients:read'];
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');

async function create({ name, scopes }) {
  name = String(name || '').trim(); if (!name) throw new BookingError(400, 'Give the token a name (e.g. "Team Hub")');
  scopes = [...new Set((scopes || []).filter(s => SCOPES.includes(s)))];
  if (!scopes.length) throw new BookingError(400, 'Pick at least one scope');
  const token = 'ch_' + crypto.randomBytes(24).toString('base64url');
  const { rows: [r] } = await query(
    'INSERT INTO api_tokens (name, token_hash, prefix, scopes) VALUES ($1,$2,$3,$4) RETURNING id, created_at',
    [name, hash(token), token.slice(0, 8), scopes]);
  return { id: r.id, name, scopes, prefix: token.slice(0, 8), token, createdAt: r.created_at };
}

async function list() {
  const { rows } = await query('SELECT id, name, prefix, scopes, created_at, last_used_at, revoked_at FROM api_tokens ORDER BY created_at DESC');
  return rows.map(r => ({ id: r.id, name: r.name, prefix: r.prefix, scopes: r.scopes, createdAt: r.created_at, lastUsedAt: r.last_used_at, revokedAt: r.revoked_at }));
}

async function revoke(id) {
  const { rowCount } = await query('UPDATE api_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [Number(id)]);
  if (!rowCount) throw new BookingError(404, 'No active token with that id');
  return { ok: true };
}

// Bearer token → { id, name, scopes } or null.
async function verify(bearer) {
  const t = String(bearer || '').trim();
  if (!t.startsWith('ch_')) return null;
  const { rows: [r] } = await query('SELECT id, name, scopes FROM api_tokens WHERE token_hash = $1 AND revoked_at IS NULL', [hash(t)]);
  if (!r) return null;
  query('UPDATE api_tokens SET last_used_at = now() WHERE id = $1', [r.id]).catch(() => {});
  return r;
}

module.exports = { SCOPES, create, list, revoke, verify };
