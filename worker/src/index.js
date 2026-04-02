require('dotenv').config();
const axios = require('axios');
const { BrowserPool } = require('./browser/pool');
const AdapterFactory = require('./adapters/factory');
const { v4: uuidv4 } = require('uuid');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const HOST_KEY = process.env.HOST_KEY || 'dev-host-key-001';
const HOST_NAME = process.env.HOST_NAME || 'LocalWorker';
const MAX_CONCURRENCY = parseInt(process.env.MAX_CONCURRENCY || '3');
const PULL_INTERVAL = parseInt(process.env.PULL_INTERVAL_MS || '5000');
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || './screenshots';

const api = axios.create({ baseURL: SERVER_URL, timeout: 30000 });

let hostId = null;
let running = 0;

function passesFilter(img, filter) {
  if (!filter) return true;
  const mode = filter.logic_mode || 'and';

  if (filter.exclude_video) {
    const url = (img.image_url || '').toLowerCase();
    if (url.endsWith('.mp4') || url.endsWith('.webm') || url.endsWith('.mov') || url.includes('video')) {
      return false;
    }
  }

  if (filter.exclude_collage) {
    const url = (img.image_url || '').toLowerCase();
    if (url.includes('collage') || url.includes('grid')) {
      return false;
    }
  }

  const checks = [];

  if (filter.min_like && filter.min_like > 0) {
    const val = parseInt(img.like_count);
    if (val && val > 0) {
      checks.push(val >= filter.min_like);
    }
  }
  if (filter.min_favorite && filter.min_favorite > 0) {
    const val = parseInt(img.favorite_count);
    if (val && val > 0) {
      checks.push(val >= filter.min_favorite);
    }
  }
  if (filter.min_comment && filter.min_comment > 0) {
    const val = parseInt(img.comment_count);
    if (val && val > 0) {
      checks.push(val >= filter.min_comment);
    }
  }
  if (filter.min_share && filter.min_share > 0) {
    const val = parseInt(img.share_count);
    if (val && val > 0) {
      checks.push(val >= filter.min_share);
    }
  }
  if (filter.min_width && filter.min_width > 0) {
    const val = parseInt(img.width);
    if (val && val > 0) {
      checks.push(val >= filter.min_width);
    }
  }
  if (filter.min_height && filter.min_height > 0) {
    const val = parseInt(img.height);
    if (val && val > 0) {
      checks.push(val >= filter.min_height);
    }
  }

  if (checks.length === 0) return true;

  if (mode === 'or') {
    return checks.some(c => c);
  }
  return checks.every(c => c);
}

async function heartbeat() {
  try {
    const res = await api.post('/api/hosts/heartbeat', {
      host_key: HOST_KEY,
      host_name: HOST_NAME,
      max_concurrency: MAX_CONCURRENCY,
      supported_sites: ['pinterest', 'behance', 'unsplash', 'dribbble', 'generic'],
      running_count: running,
    });
    if (res.data.host_id) {
      hostId = res.data.host_id;
    }
    console.log(`[Heartbeat] OK - hostId=${hostId} running=${running}`);
  } catch (err) {
    console.error('[Heartbeat] 失败:', err.message);
  }
}

async function pullAndExecute(pool) {
  if (!hostId) return;
  const available = Math.max(0, MAX_CONCURRENCY - running);
  if (available <= 0) return;

  try {
    const res = await api.post('/api/tasks/pull', {
      host_id: hostId,
      max_tasks: available
    });

    const tasks = res.data.tasks || [];
    if (tasks.length === 0) return;

    console.log(`[Worker] 拉取到 ${tasks.length} 个任务`);

    for (const task of tasks) {
      running++;
      executeTask(pool, task).finally(() => { running--; });
    }
  } catch (err) {
    console.error('[Worker] 拉取任务失败:', err.message);
  }
}

async function executeTask(pool, task) {
  const browser = await pool.acquire();
  let page;
  try {
    console.log(`[Task] 开始执行 #${task.id} - ${task.task_type} - ${task.target_url}`);
    if (task.filters) {
      console.log(`[Task] 筛选规则: ${JSON.stringify(task.filters)}`);
    }

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'en-US',
    });
    page = await context.newPage();

    const adapter = AdapterFactory.create(task.site_type || 'generic');
    const result = await adapter.crawl(page, task);

    let images = result.images || [];
    const totalBeforeFilter = images.length;

    if (task.filters && images.length > 0) {
      const filtered = [];
      const passed = [];
      for (const img of images) {
        if (passesFilter(img, task.filters)) {
          passed.push(img);
        } else {
          filtered.push(img);
        }
      }
      if (filtered.length > 0) {
        console.log(`[Filter] 筛选: ${totalBeforeFilter}张 -> 通过${passed.length}张, 过滤${filtered.length}张`);
        for (const f of filtered.slice(0, 5)) {
          console.log(`[Filter]   过滤: like=${f.like_count || 0} fav=${f.favorite_count || 0} w=${f.width || '?'} h=${f.height || '?'}`);
        }
        if (filtered.length > 5) {
          console.log(`[Filter]   ...还有${filtered.length - 5}张被过滤`);
        }
      }
      images = passed;
    }

    await api.post('/api/tasks/report', {
      page_task_id: task.id,
      host_id: hostId,
      status: 'success',
      images: images,
      new_page_tasks: result.new_tasks || [],
    });

    console.log(`[Task] 完成 #${task.id} - 提取:${totalBeforeFilter} 上报:${images.length} 新任务:${(result.new_tasks || []).length}`);
  } catch (err) {
    console.error(`[Task] 失败 #${task.id}:`, err.message);
    try {
      await api.post('/api/tasks/report', {
        page_task_id: task.id,
        host_id: hostId,
        status: 'failed',
        error_message: err.message,
        images: [],
        new_page_tasks: [],
      });
    } catch (reportErr) {
      console.error('[Task] 回传失败:', reportErr.message);
    }
  } finally {
    if (page) {
      const ctx = page.context();
      try { await page.close(); } catch {}
      try { await ctx.close(); } catch {}
    }
    pool.release(browser);
  }
}

async function main() {
  console.log(`[Worker] 启动 - HOST_KEY=${HOST_KEY} MAX_CONCURRENCY=${MAX_CONCURRENCY}`);
  const pool = new BrowserPool(MAX_CONCURRENCY);
  await pool.init();

  await heartbeat();
  setInterval(heartbeat, 30000);

  setInterval(() => pullAndExecute(pool), PULL_INTERVAL);

  process.on('SIGTERM', async () => {
    console.log('[Worker] 收到SIGTERM，正在关闭...');
    await pool.destroy();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('[Worker] 启动失败:', err);
  process.exit(1);
});
