const test = require('node:test');
const assert = require('node:assert/strict');
const { leaseDurationSeconds, lockTaskLifecycle } = require('../src/services/taskLifecycle');

test('lease covers page and scroll deadlines and retains 180 second minimum', () => {
  assert.equal(leaseDurationSeconds({ page_timeout_seconds: 60, auto_scroll_seconds: 0 }), 180);
  assert.equal(leaseDurationSeconds({ page_timeout_seconds: 120, auto_scroll_seconds: 60 }), 270);
  assert.equal(leaseDurationSeconds({}), 180);
  assert.equal(leaseDurationSeconds({ page_timeout_seconds: -10 }), 180);
});

test('lifecycle lock is transaction scoped with a stable shared key', async () => {
  const queries = [];
  await lockTaskLifecycle({ execute: async sql => queries.push(sql) });
  assert.deepEqual(queries, ['SELECT pg_advisory_xact_lock(6878, 7)']);
});
