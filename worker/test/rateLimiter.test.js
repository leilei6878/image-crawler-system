const test = require('node:test');
const assert = require('node:assert/strict');
const RateLimiter = require('../src/rateLimiter');

test('rate limiter enforces a configured minimum delay per source', async () => {
  const limiter = new RateLimiter();
  const startedAt = Date.now();
  await limiter.wait('source-1', { requests_per_minute: 120, min_delay_seconds: 0.02, burst: 1 });
  await limiter.wait('source-1', { requests_per_minute: 120, min_delay_seconds: 0.02, burst: 1 });
  assert.ok(Date.now() - startedAt >= 15);
});

test('rate limiter isolates different sources and tolerates invalid JSON', async () => {
  const limiter = new RateLimiter();
  const startedAt = Date.now();
  await limiter.wait('source-a', '{invalid');
  await limiter.wait('source-b', '{invalid');
  assert.ok(Date.now() - startedAt < 500);
});
