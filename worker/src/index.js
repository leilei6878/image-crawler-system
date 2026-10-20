require('dotenv').config();
const axios = require('axios');
const { BrowserPool } = require('./browser/pool');
const AdapterFactory = require('./adapters/factory');
const { v4: uuidv4 } = require('uuid');
const { passesFilter } = require('./filter');
const RateLimiter = require('./rateLimiter');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const HOST_KEY = process.env.HOST_KEY;
const HOST_NAME = process.env.HOST_NAME || 'LocalWorker';
let maxConcurrency = parseInt(process.env.MAX_CONCURRENCY || '3', 10);
const PULL_INTERVAL = parseInt(process.env.PULL_INTERVAL_MS || '5000', 10);
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || './screenshots';

const api = axios.create({ baseURL: SERVER_URL, timeout: 30000 });

let hostId = null;
let running = 0;
const rateLimiter = new RateLimiter();

function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} exceeded timeout ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function heartbeat(pool) {
  try {
    const res = await api.post('/api/hosts/heartbeat', {
      host_key: HOST_KEY,
      host_name: HOST_NAME,
      registration_token: process.env.WORKER_REGISTRATION_TOKEN,
      max_concurrency: maxConcurrency,
      supported_sites: AdapterFactory.supportedSiteTypes(),
      running_count: running,
    });

    if (res.data.host_id) {
      hostId = res.data.host_id;
    }

    const serverConcurrency = parseInt(res.data.max_concurrency, 10);
    if (serverConcurrency && serverConcurrency !== maxConcurrency) {
      const previous = maxConcurrency;
      maxConcurrency = serverConcurrency;
      if (pool) {
        await pool.resize(maxConcurrency);
      }
      console.log(`[Worker] Updated max concurrency from server: ${previous} -> ${maxConcurrency}`);
    }

    console.log(`[Heartbeat] OK - hostId=${hostId} running=${running}`);
  } catch (err) {
    console.error('[Heartbeat] failed:', err.message);
  }
}

async function pullAndExecute(pool) {
  if (!hostId) return;
  const available = Math.max(0, maxConcurrency - running);
  if (available <= 0) return;

  try {
    const res = await api.post('/api/tasks/pull', {
      host_id: hostId,
      host_key: HOST_KEY,
      max_tasks: available
    });

    const tasks = res.data.tasks || [];
    if (tasks.length === 0) return;

    console.log(`[Worker] Pulled ${tasks.length} task(s)`);

    for (const task of tasks) {
      running++;
      executeTask(pool, task).finally(() => { running--; });
    }
  } catch (err) {
    console.error('[Worker] pull failed:', err.message);
  }
}

async function executeTask(pool, task) {
  const browser = task.site_type === 'generic' ? null : await pool.acquire();
  let page;
  try {
    console.log(`[Task] Start #${task.id} - ${task.task_type} - ${task.target_url}`);
    if (task.filters) {
      console.log(`[Task] Filters: ${JSON.stringify(task.filters)}`);
    }

    const context = browser && await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
    });
    page = context ? await context.newPage() : null;

    const adapter = AdapterFactory.create(task.site_type || 'generic');
    const hardTimeoutMs = Math.max(
      ((task.page_timeout_seconds || 60) + (task.auto_scroll_seconds || 0) + 45) * 1000,
      120000
    );
    await rateLimiter.wait(task.source_id || task.job_id, task.rate_limit_policy);

    const result = await withTimeout(
      adapter.crawl(page, task),
      hardTimeoutMs,
      `Task #${task.id}`
    );

    let images = result.images || [];
    const totalBeforeFilter = images.length;

    if (task.filters && images.length > 0) {
      const filtered = [];
      const passed = [];
      for (const img of images) {
        if (passesFilter(img, task.filters, task.site_type)) {
          passed.push(img);
        } else {
          filtered.push(img);
        }
      }

      if (filtered.length > 0) {
        console.log(`[Filter] ${totalBeforeFilter} -> passed ${passed.length}, filtered ${filtered.length}`);
        for (const f of filtered.slice(0, 5)) {
          console.log(`[Filter]   filtered: like=${f.like_count || 0} fav=${f.favorite_count || 0} w=${f.width || '?'} h=${f.height || '?'}`);
        }
        if (filtered.length > 5) {
          console.log(`[Filter]   ...and ${filtered.length - 5} more`);
        }
      }
      images = passed;
    }

    const maxImages = parseInt(task.max_images || 0, 10);
    if (maxImages > 0 && images.length > maxImages) {
      images = images.slice(0, maxImages);
    }

    await api.post('/api/tasks/report', {
      page_task_id: task.id,
      host_id: hostId,
      host_key: HOST_KEY,
      status: 'success',
      lease_token: task.lease_token,
      images,
      new_page_tasks: result.new_tasks || [],
    });

    console.log(`[Task] Done #${task.id} - extracted:${totalBeforeFilter} reported:${images.length} new_tasks:${(result.new_tasks || []).length}`);
  } catch (err) {
    console.error(`[Task] Failed #${task.id}:`, err.message);
    try {
      await api.post('/api/tasks/report', {
        page_task_id: task.id,
        host_id: hostId,
        host_key: HOST_KEY,
        status: 'failed',
        lease_token: task.lease_token,
        error_message: err.message,
        images: [],
        new_page_tasks: [],
      });
    } catch (reportErr) {
      console.error('[Task] report failed:', reportErr.message);
    }
  } finally {
    if (page) {
      const ctx = page.context();
      try { await page.close(); } catch {}
      try { await ctx.close(); } catch {}
    }
    if (browser) pool.release(browser);
  }
}

async function main() {
  if (!HOST_KEY || HOST_KEY.length < 16) throw new Error('Set a unique HOST_KEY with at least 16 characters');
  console.log(`[Worker] Starting - MAX_CONCURRENCY=${maxConcurrency}`);
  const pool = new BrowserPool(maxConcurrency);
  if (AdapterFactory.supportedSiteTypes().some(site => site !== 'generic')) await pool.init();

  await heartbeat(pool);
  setInterval(() => {
    heartbeat(pool).catch(err => {
      console.error('[Heartbeat] timer failed:', err.message);
    });
  }, 30000);

  setInterval(() => pullAndExecute(pool), PULL_INTERVAL);

  process.on('SIGTERM', async () => {
    console.log('[Worker] Received SIGTERM, shutting down...');
    await pool.destroy();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[Worker] Startup failed:', err);
  process.exit(1);
});
