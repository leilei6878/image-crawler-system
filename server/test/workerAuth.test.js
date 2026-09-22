const test = require('node:test');
const assert = require('node:assert/strict');
const { secretsEqual, workerAuthRequired } = require('../src/services/workerAuth');

test('worker credential comparison is exact and length-safe', () => {
  assert.equal(secretsEqual('worker-key', 'worker-key'), true);
  assert.equal(secretsEqual('worker-key', 'worker-key-2'), false);
  assert.equal(secretsEqual('worker-key', null), false);
});

test('worker authentication is required by default', () => {
  const previous = process.env.REQUIRE_WORKER_AUTH;
  delete process.env.REQUIRE_WORKER_AUTH;
  assert.equal(workerAuthRequired(), true);
  if (previous === undefined) delete process.env.REQUIRE_WORKER_AUTH;
  else process.env.REQUIRE_WORKER_AUTH = previous;
});
