// Real PostgreSQL + HTTP + Worker integration. Only newly created local test databases are used.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { migrate } = require('../scripts/migrate');

const root = path.resolve(__dirname, '../..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(check, label, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await pause(200);
  }
  throw new Error('Timed out waiting for ' + label);
}
async function listen(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return 'http://127.0.0.1:' + server.address().port;
}
async function close(server) {
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

(async () => {
  const config = JSON.parse((await fs.readFile(path.join(root, 'data/local-db.json'), 'utf8')).replace(/^\uFEFF/, ''));
  assert.equal(config.host, '127.0.0.1');
  const database = 'crawler_test_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
  const admin = new Client({ ...config, database: 'postgres' });
  await admin.connect();
  await admin.query('CREATE DATABASE ' + database);
  await admin.end();
  const target = { ...config, database };
  await migrate(target);
  await migrate(target); // Migrations must preserve already initialized tables.
  const url = new URL('postgresql://127.0.0.1');
  url.username = target.user;
  url.password = target.password;
  url.port = target.port;
  url.pathname = '/' + database;
  process.env.DATABASE_URL = url.href;
  process.env.ADMIN_API_TOKEN = crypto.randomBytes(32).toString('hex');
  process.env.WORKER_REGISTRATION_TOKEN = crypto.randomBytes(32).toString('hex');
  process.env.ALLOW_LOCAL_CRAWL_TARGETS = 'true';
  process.env.DOWNLOAD_DIR = path.join(root, 'data/e2e', database, 'downloads');
  const records = [];
  const fixture = http.createServer((req, res) => {
    records.push({ path: req.url, at: Date.now() });
    if (req.url === '/robots.txt') { res.setHeader('Content-Type', 'text/plain'); res.end('User-agent: *\nDisallow: /denied'); return; }
    if (req.url.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
      res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXRcAAAAASUVORK5CYII=', 'base64'));
      return;
    }
    res.setHeader('Content-Type', 'text/html');
    res.end('<html><head><meta property="og:image" content="/og.png"><link rel="image_src" href="/link.png"></head><body><img src="/a.png" alt="Controlled asset" width="1" height="1"><img src="/a.png" srcset="/b.png 2x"></body></html>');
  });
  const fixtureUrl = await listen(fixture);
  const { app } = require('../src/index');
  let api = http.createServer(app);
  let apiUrl = await listen(api);
  const workers = [];
  let browser;
  let page;
  const workerOutput = [];
  const request = async (route, body, method = body === undefined ? 'GET' : 'POST', token = process.env.ADMIN_API_TOKEN) => {
    const response = await fetch(apiUrl + '/api' + route, {
      method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    const value = await response.json();
    assert.ok(response.ok, route + ': ' + response.status + ' ' + JSON.stringify(value));
    return value;
  };
  try {
    const unauthenticated = await fetch(apiUrl + '/api/social/sources');
    assert.equal(unauthenticated.status, 401);
    const worker = spawn(process.execPath, [path.join(root, 'worker/src/index.js')], {
      cwd: path.join(root, 'worker'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, SERVER_URL: apiUrl, HOST_KEY: crypto.randomBytes(32).toString('hex'),
        HOST_NAME: 'Controlled-E2E-Worker', MAX_CONCURRENCY: '1', PULL_INTERVAL_MS: '250',
        PYTHON_EXECUTABLE: path.join(root, '.venv/Scripts/python.exe') },
    });
    workers.push(worker);
    worker.on('error', error => workerOutput.push(error.message));
    worker.stdout.on('data', data => workerOutput.push(data.toString()));
    worker.stderr.on('data', data => workerOutput.push(data.toString()));
    await waitFor(async () => (await request('/hosts')).data.some(host => host.status === 'online'), 'Worker registration');
    let source, job, queued;
    if (process.env.BROWSER_CHECK === 'true') {
      const { chromium } = require('../../worker/node_modules/playwright');
      browser = await chromium.launch({ channel: 'chrome', headless: true });
      page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const browserErrors = [];
      page.on('pageerror', error => browserErrors.push(error.message));
      await page.goto(apiUrl + '/social');
      await page.getByLabel('管理密钥').fill(process.env.ADMIN_API_TOKEN);
      await page.getByRole('button', { name: '连接管理端' }).click();
      await page.getByRole('heading', { name: '社媒采集管理' }).waitFor();
      const sourceForm = page.locator('form').filter({ has: page.getByRole('heading', { name: '创建账号源', exact: true }) });
      await sourceForm.getByPlaceholder('品牌名或公开主页名').fill('Controlled HTML E2E');
      await sourceForm.getByPlaceholder('https://example.com/brand').fill(fixtureUrl + '/gallery');
      const sourceResponse = page.waitForResponse(res => res.url().endsWith('/api/social/sources') && res.request().method() === 'POST');
      await sourceForm.getByRole('button', { name: '创建账号源', exact: true }).click();
      source = await (await sourceResponse).json();
      assert.ok(source.id, JSON.stringify(source));
      const jobResponse = page.waitForResponse(res => res.url().endsWith('/api/social/jobs') && res.request().method() === 'POST');
      await page.getByRole('button', { name: '创建采集任务', exact: true }).click();
      job = await (await jobResponse).json();
      assert.ok(job.id, JSON.stringify(job));
      const runResponse = page.waitForResponse(res => res.url().endsWith('/run') && res.request().method() === 'POST');
      await page.getByRole('button', { name: '运行', exact: true }).click();
      queued = await (await runResponse).json();
      assert.deepEqual(browserErrors, []);
    } else {
      source = await request('/social/sources', {
        platform: 'website', account_name: 'Controlled HTML E2E', profile_url: fixtureUrl + '/gallery',
        max_items: 10, rate_limit_policy: { requests_per_minute: 60, min_delay_seconds: 1, burst: 1 },
      });
      job = await request('/social/jobs', { source_id: source.id, max_items: 10 });
      queued = await request('/social/jobs/' + job.id + '/run', {});
    }
    assert.equal(queued.run.status, 'queued');
    await waitFor(async () => {
      const status = await request('/social/jobs/' + job.id + '/status');
      if (['failed', 'partial_failed'].includes(status.status)) throw new Error('Worker flow failed: ' + JSON.stringify(status));
      return status.status === 'completed';
    }, 'real Worker report', 45000);
    const runs = (await request('/social/runs', undefined)).data;
    const run = runs.find(item => item.id === queued.run.id);
    assert.equal(run.status, 'completed');
    assert.equal(run.images.length, 4);
    assert.ok(run.images.every(image => image.image_url.startsWith(fixtureUrl + '/')));
    const saved = await request('/images/' + run.images[0].id + '/download', {});
    assert.equal(saved.content_type, 'image/png');
    assert.ok(saved.file_size_bytes > 0);
    const file = await fs.stat(path.join(process.env.DOWNLOAD_DIR, saved.local_path));
    assert.equal(file.size, saved.file_size_bytes);
    assert.ok(records.some(record => record.path === '/robots.txt'));
    assert.ok(records.some(record => record.path === '/gallery'));
    if (page) {
      await page.getByRole('button', { name: '刷新', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.social-image-card').length === 4);
      const screenshotDir = path.join(root, 'data/e2e', database);
      await fs.mkdir(screenshotDir, { recursive: true });
      await page.screenshot({ path: path.join(screenshotDir, 'desktop.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(screenshotDir, 'mobile.png'), fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert.equal(overflow, false, 'Mobile layout overflows viewport');
      console.log('Browser screenshot directory:', path.relative(root, screenshotDir));
    }
    for (const child of workers) child.kill();
    await close(api);
    api = http.createServer(app);
    apiUrl = await listen(api);
    const afterRestart = (await request('/social/runs')).data;
    assert.equal(afterRestart.find(item => item.id === run.id).images.length, 4);
    console.log(JSON.stringify({ result: 'PASS', database, images: 4, fixtureRequests: records.length,
      checks: ['management auth', 'migrations idempotent', 'real Worker/Python extraction', 'image download', 'HTTP server restart retains data'] }));
  } catch (error) {
    console.error('Worker diagnostics:', workerOutput.join('').slice(-5000));
    throw error;
  } finally {
    if (browser) await browser.close();
    for (const child of workers) child.kill();
    await close(api);
    await close(fixture);
    await require('../src/db').close();
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
