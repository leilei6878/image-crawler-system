const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedByRobots } = require('../src/security/robots');

test('robots policy honors the longest allow/disallow match', () => {
  const robots = `User-agent: *\nDisallow: /\nAllow: /public/`;
  assert.equal(isAllowedByRobots(robots, 'https://example.com/public/image'), true);
  assert.equal(isAllowedByRobots(robots, 'https://example.com/private/image'), false);
});

test('robots policy allows pages without a matching group', () => {
  assert.equal(
    isAllowedByRobots('User-agent: SomeOtherBot\nDisallow: /', 'https://example.com/page'),
    true
  );
});
