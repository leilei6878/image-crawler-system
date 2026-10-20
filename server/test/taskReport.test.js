// Handler-level tests with a mocked database; PostgreSQL semantics are covered
// separately by taskLifecycle.postgres.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const dbPath = require.resolve('../src/db');
let activeConnection;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true,
  exports: { getConnection: async () => activeConnection, execute: async () => [[]] } };
const router = require('../src/routes/tasks');
const report = router.stack.find(layer => layer.route?.path === '/report').route.stack[0].handle;

async function submit(task, body = {}, maxRetry = 3) {
  const writes = [];
  const state = { ...task };
  let committed = false, rolledBack = false;
  activeConnection = {
    beginTransaction: async () => {}, commit: async () => { committed = true; },
    rollback: async () => { rolledBack = true; }, release: () => {},
    execute: async (sql, params) => {
      if (sql.startsWith('SELECT *, ')) return [[state]];
      if (sql.includes('SELECT id, host_key')) return [[{ id: 1, host_key: 'key', status: 'online' }]];
      if (sql.includes('SELECT max_retry_count')) return [[{ max_retry_count: maxRetry }]];
      if (sql.includes('COUNT(*) as cnt')) return [[{ cnt: 1 }]];
      if (sql.trim().startsWith('UPDATE') || sql.trim().startsWith('INSERT')) writes.push({ sql, params });
      return [[]];
    }
  };
  let code = 200, result;
  const res = { status(value) { code = value; return this; }, json(value) { result = value; return this; } };
  await report({ body: { host_id: 1, host_key: 'key', page_task_id: 10, lease_token: 'current', status: 'success', ...body } }, res);
  return { code, result, writes, committed, rolledBack };
}
const running = { id: 10, job_id: 2, assigned_host_id: 1, status: 'running', lease_token: 'current', lease_valid: true, retry_count: 0 };

test('valid lease accepts successful report exactly once at handler boundary', async () => {
  const result = await submit(running);
  assert.equal(result.code, 200); assert.equal(result.committed, true);
  assert.equal(result.writes.filter(w => w.sql.includes("status = 'success'")).length, 1);
  const duplicate = await submit({ ...running, status: 'success', lease_valid: false });
  assert.equal(duplicate.result.duplicate, true); assert.deepEqual(duplicate.writes, []);
});

test('expired running lease rejects late success before recovery', async () => {
  const result = await submit({ ...running, lease_valid: false });
  assert.equal(result.code, 409); assert.equal(result.rolledBack, true); assert.deepEqual(result.writes, []);
});

test('recovered, pending and reclaimed tasks reject a stale attempt', async () => {
  for (const task of [
    { ...running, status: 'retry_waiting', lease_token: null },
    { ...running, status: 'pending', lease_token: null },
    { ...running, lease_token: 'new-attempt' },
    { ...running, status: 'success', lease_token: 'new-attempt' }
  ]) {
    const result = await submit(task);
    assert.equal(result.code, 409); assert.deepEqual(result.writes, []);
  }
});

test('cancelled tasks ignore late results without creating assets or children', async () => {
  const result = await submit({ ...running, status: 'cancelled', lease_token: null });
  assert.equal(result.code, 200); assert.deepEqual(result.writes, []);
});

test('accepted failed attempt is idempotent while waiting for retry', async () => {
  const result = await submit(running, { status: 'failed' });
  assert.equal(result.code, 200);
  assert.equal(result.writes.filter(w => w.sql.includes('retry_count = retry_count + 1')).length, 1);
  const duplicate = await submit({ ...running, status: 'retry_waiting', lease_valid: false }, { status: 'failed' });
  assert.equal(duplicate.result.duplicate, true); assert.deepEqual(duplicate.writes, []);
});

test('configured zero retry budget is respected rather than defaulted to three', async () => {
  const result = await submit(running, { status: 'failed' }, 0);
  assert.equal(result.code, 200);
  assert.equal(result.writes.filter(w => w.sql.includes("status = 'failed'")).length, 1);
  assert.equal(result.writes.filter(w => w.sql.includes('retry_count = retry_count + 1')).length, 0);
});

test('wrong worker or credentials cannot report a task', async () => {
  const wrongHost = await submit({ ...running, assigned_host_id: 2 });
  assert.equal(wrongHost.code, 403); assert.deepEqual(wrongHost.writes, []);
  const wrongKey = await submit(running, { host_key: 'invalid' });
  assert.equal(wrongKey.code, 401); assert.deepEqual(wrongKey.writes, []);
});
