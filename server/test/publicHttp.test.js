const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { fetchPublic, normalizePublicHttpUrl, resolvePublicUrl } = require('../../shared/publicHttp');
const { fetchImageWithLimits } = require('../src/services/imageDownload');

test('policy rejects credentials, private IPv4/IPv6, encoded IPs and mixed DNS', async () => {
  for (const url of [
    'https://user:pass@example.com/', 'http://2130706433/', 'http://[::ffff:7f00:1]/',
    'http://[fe90::1]/', 'http://100.64.0.1/', 'http://169.254.169.254/',
    'file:///test', 'javascript:alert(1)',
  ]) assert.throws(() => normalizePublicHttpUrl(url));
  await assert.rejects(resolvePublicUrl('https://example.com/', {
    lookup: async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }],
  }), { code: 'POLICY_DENIED' });
});

test('bounded HTTP covers redirects, body limits, stalled bodies, and image types', async (t) => {
  const original = process.env.ALLOW_LOCAL_CRAWL_TARGETS;
  process.env.ALLOW_LOCAL_CRAWL_TARGETS = 'true';
  const fixture = http.createServer((req, res) => {
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/image' }); res.end(); }
    else if (req.url === '/loop') { res.writeHead(302, { Location: '/loop' }); res.end(); }
    else if (req.url === '/slow') { res.writeHead(200, { 'Content-Type': 'image/png' }); res.write('x'); }
    else if (req.url === '/large') { res.end(Buffer.alloc(1000)); }
    else if (req.url === '/html') { res.setHeader('Content-Type', 'text/html'); res.end('<html>not an image</html>'); }
    else { res.setHeader('Content-Type', 'image/png'); res.end(Buffer.from('fixture-image')); }
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + fixture.address().port;
  try {
    await t.test('downloads bounded image after safe redirect', async () => {
      const result = await fetchImageWithLimits(base + '/redirect', { maxBytes: 100, timeoutMs: 1000 });
      assert.equal(result.contentType, 'image/png');
      assert.equal(result.size, 13);
      assert.equal(result.finalUrl, base + '/image');
    });
    await t.test('byte limit terminates the stream', async () => {
      await assert.rejects(fetchPublic(base + '/large', { maxBytes: 20 }), { code: 'BODY_TOO_LARGE' });
    });
    await t.test('body timeout remains active after headers', async () => {
      const start = Date.now();
      await assert.rejects(fetchPublic(base + '/slow', { timeoutMs: 100 }), /time limit|aborted/);
      assert.ok(Date.now() - start < 1000);
    });
    await t.test('redirect budget and MIME checks reject invalid downloads', async () => {
      await assert.rejects(fetchPublic(base + '/loop', { maxRedirects: 1 }), { code: 'REDIRECT_LIMIT' });
      await assert.rejects(fetchImageWithLimits(base + '/html', {}), { code: 'CONTENT_TYPE' });
    });
    await t.test('redirect target is checked again before connecting', async () => {
      await assert.rejects(fetchPublic(base + '/redirect', {
        beforeRequest: async url => { if (url.endsWith('/image')) delete process.env.ALLOW_LOCAL_CRAWL_TARGETS; },
      }), { code: 'POLICY_DENIED' });
    });
  } finally {
    if (original === undefined) delete process.env.ALLOW_LOCAL_CRAWL_TARGETS;
    else process.env.ALLOW_LOCAL_CRAWL_TARGETS = original;
    fixture.closeAllConnections();
    await new Promise(resolve => fixture.close(resolve));
  }
});
