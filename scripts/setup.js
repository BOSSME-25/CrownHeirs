#!/usr/bin/env node
// Local/CI helper: DATABASE_URL=... node scripts/setup.js
const { migrate, seed, status } = require('../lib/setup');
const { getPool } = require('../lib/db');

(async () => {
  await migrate();
  console.log('schema: ok');
  const r = await seed();
  console.log('seed:', r);
  console.log('status:', await status());
  await getPool().end();
})().catch((e) => { console.error(e.message); process.exit(1); });
