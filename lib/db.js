// Thin Postgres layer. One pool per warm function instance.
const { Pool } = require('pg');

const NO_DATABASE = 'NO_DATABASE';
let pool;

function connectionString() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || '';
}

function getPool() {
  if (pool) return pool;
  const cs = connectionString();
  if (!cs) {
    const e = new Error(
      'No database is connected to this project. In Vercel: Storage → Create Database → Postgres (Neon), ' +
      'connect it to crown-heirs, then redeploy. (Looks for DATABASE_URL or POSTGRES_URL.)'
    );
    e.code = NO_DATABASE;
    throw e;
  }
  const local = /localhost|127\.0\.0\.1/.test(cs);
  pool = new Pool({
    connectionString: cs,
    ssl: local ? false : { rejectUnauthorized: false },
    max: 3,                       // serverless: many small instances, not one big one
    idleTimeoutMillis: 10000
  });
  return pool;
}

const query = (text, params) => getPool().query(text, params);

async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

const SETTING_DEFAULTS = { time_zone: 'America/Phoenix', lead_min: 120, max_days_ahead: 60, step_min: 15 };
async function getSettings() {
  const { rows } = await query('SELECT key, value FROM settings');
  const s = { ...SETTING_DEFAULTS };
  for (const r of rows) s[r.key] = /^\d+$/.test(r.value) ? Number(r.value) : r.value;
  return s;
}

// Turn a thrown error into an HTTP status + message the admin can act on.
function httpError(e) {
  if (e.code === NO_DATABASE) return { status: 503, error: e.message };
  if (e.code === '42P01') return { status: 503, error: 'Booking tables have not been created yet — run setup from /admin.' };
  if (e.code === '23P01') return { status: 409, error: 'That time was just taken. Please pick another slot.' };
  return { status: 500, error: e.message };
}

module.exports = { query, withTransaction, getPool, getSettings, httpError, NO_DATABASE };
