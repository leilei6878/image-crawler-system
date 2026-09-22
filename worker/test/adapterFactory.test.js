const test = require('node:test');
const assert = require('node:assert/strict');
const AdapterFactory = require('../src/adapters/factory');

test('worker V1 exposes only the generic public adapter', () => {
  assert.deepEqual(AdapterFactory.supportedSiteTypes(), ['generic']);
  assert.throws(() => AdapterFactory.create('pinterest'), /not supported/);
  assert.equal(AdapterFactory.create('generic').siteType, 'generic');
});
