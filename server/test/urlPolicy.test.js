const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizePublicHttpUrl, isBlockedHostname } = require('../src/services/urlPolicy');

test('server URL policy rejects non-http and private literal targets', () => {
  assert.throws(() => normalizePublicHttpUrl('data:text/html,blocked'), /public http/);
  assert.throws(() => normalizePublicHttpUrl('http://127.0.0.1:8080'), /local or private/);
  assert.equal(isBlockedHostname('192.168.1.10'), true);
});

test('server URL policy normalizes public URL syntax', () => {
  assert.equal(
    normalizePublicHttpUrl('https://example.com/gallery#section'),
    'https://example.com/gallery'
  );
});
