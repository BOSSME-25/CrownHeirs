// Postgres error codes → HTTP responses the admin can act on. No database needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { httpError, NO_DATABASE } = require('../lib/db');

test('missing DATABASE_URL, missing tables, missing columns and slot clashes map to actionable statuses', () => {
  const noDb = Object.assign(new Error('No database is connected …'), { code: NO_DATABASE });
  assert.equal(httpError(noDb).status, 503);
  assert.equal(httpError({ code: '42P01' }).status, 503);
  assert.match(httpError({ code: '42P01' }).error, /run setup from \/admin/);
  assert.equal(httpError({ code: '42703' }).status, 503);
  assert.match(httpError({ code: '42703' }).error, /Set up \/ refresh/);
  assert.equal(httpError({ code: '23P01' }).status, 409);
  assert.deepEqual(httpError(new Error('other')), { status: 500, error: 'other' });
});
