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

const api = axios.create({ baseURL: SERVER_URL, timeout: 10000 });

let hostId = null;
let running = 0;

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
    page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

    const adapter = AdapterFactory.create(task.site_type || 'generic');
    const result = await adapter.crawl(page, task);

    await api.post('/api/tasks/report', {
      page_task_id: task.id,
      host_id: hostId,
      status: 'success',
      images: result.images || [],
      new_page_tasks: result.new_tasks || [],
    });

    console.log(`[Task] 完成 #${task.id} - 图片:${(result.images || []).length} 新任务:${(result.new_tasks || []).length}`);
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
      try { await page.close(); } catch {}
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
