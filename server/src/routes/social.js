const express = require('express');
const db = require('../db');
const logger = require('../services/logger');
const { assertPublicHttpUrl } = require('../services/urlPolicy');

const router = express.Router();

const platforms = ['xiaohongshu', 'weibo', 'instagram', 'pinterest', 'tiktok', 'website', 'other'];
const crawlModes = ['historical', 'incremental', 'temporary'];
const scheduleTypes = ['manual', 'interval', 'cron'];
const unsupportedScheduleTypes = ['cron'];
const socialPlatforms = new Set(['xiaohongshu', 'weibo', 'instagram', 'pinterest', 'tiktok', 'other']);

function parseJsonObject(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function stringifyJson(value) {
  return JSON.stringify(value || {});
}

function ensureChoice(value, allowed, fieldName) {
  if (!allowed.includes(value)) {
    throw new Error(`${fieldName} must be one of: ${allowed.join(', ')}`);
  }
}

async function validatePublicUrl(value) {
  return assertPublicHttpUrl(value, 'profile_url');
}

function normalizeRateLimit(raw = {}) {
  const requestsPerMinute = Number(raw.requests_per_minute ?? 6);
  const minDelaySeconds = Number(raw.min_delay_seconds ?? 10);
  const burst = Number(raw.burst ?? 1);

  if (!Number.isInteger(requestsPerMinute) || requestsPerMinute <= 0 ||
      !Number.isFinite(minDelaySeconds) || minDelaySeconds < 0 ||
      !Number.isInteger(burst) || burst <= 0) {
    throw new Error('rate_limit_policy values must be positive');
  }

  return {
    requests_per_minute: requestsPerMinute,
    min_delay_seconds: minDelaySeconds,
    burst
  };
}

function normalizeIntervalSeconds(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 60 || parsed > 2592000) {
    throw new Error('interval_seconds must be an integer between 60 and 2592000');
  }
  return parsed;
}

function adapterForPlatform(platform) {
  return platform === 'website' ? 'generic_public_page_adapter' : 'mock_social_adapter';
}

function executionModeForPlatform(platform) {
  return platform === 'website' ? 'real' : 'mock';
}

function publicSourceRow(row) {
  const rateLimitPolicy = parseJsonObject(row.rate_limit_policy, {});
  const metadata = parseJsonObject(row.metadata, {});
  return {
    id: row.id,
    platform: row.platform,
    account_name: row.account_name,
    profile_url: row.profile_url,
    crawl_mode: row.crawl_mode,
    schedule_type: row.schedule_type,
    max_items: Number(row.max_items || 0),
    status: row.status,
    last_crawled_at: row.last_crawled_at,
    rate_limit_policy: rateLimitPolicy,
    notes: row.notes || '',
    adapter: row.adapter_type || adapterForPlatform(row.platform),
    execution_mode: row.execution_mode || executionModeForPlatform(row.platform),
    metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
    job_count: Number(row.job_count || 0),
    run_count: Number(row.run_count || 0),
    image_count: Number(row.image_count || 0),
    last_run_status: row.last_run_status || null
  };
}

function publicJobRow(row) {
  return {
    id: row.id,
    source_id: row.source_id,
    job_id: row.job_id,
    crawl_mode: row.crawl_mode,
    schedule_type: row.schedule_type,
    max_items: Number(row.max_items || 0),
    status: row.status,
    interval_seconds: row.interval_seconds,
    cron_expression: row.cron_expression,
    next_run_at: row.next_run_at,
    last_run_at: row.last_run_at,
    notes: row.notes || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at,
    finished_at: row.finished_at,
    platform: row.platform,
    account_name: row.account_name,
    profile_url: row.profile_url,
    adapter: row.adapter_type || adapterForPlatform(row.platform),
    execution_mode: row.execution_mode || executionModeForPlatform(row.platform),
    run_count: Number(row.run_count || 0),
    image_count: Number(row.image_count || 0),
    last_run: row.last_run_id ? {
      id: row.last_run_id,
      status: row.last_run_status,
      started_at: row.last_run_started_at,
      finished_at: row.last_run_finished_at,
      image_count: Number(row.last_run_image_count || 0),
      error: row.last_run_error || null
    } : null
  };
}

function publicImageRow(row) {
  return {
    id: row.id,
    source_name: row.account_name || row.source_name || '',
    source_url: row.profile_url || row.source_page_url || '',
    image_url: row.image_url,
    normalized_image_url: row.image_url,
    title: row.title || row.author_name || '',
    alt_text: row.alt_text || '',
    width: row.width,
    height: row.height,
    content_type: row.content_type || null,
    discovered_at: row.created_at,
    local_path: row.local_path || null,
    file_size_bytes: row.file_size_bytes || null,
    downloaded_at: row.downloaded_at || null,
    metadata: {
      job_id: row.job_id,
      page_task_id: row.page_task_id,
      host_id: row.host_id,
      detail_page_url: row.detail_page_url,
      source_page_url: row.source_page_url
    }
  };
}

async function getSource(id, dbConn = db) {
  const [rows] = await dbConn.execute('SELECT * FROM social_sources WHERE id = ?', [id]);
  return rows[0] || null;
}

async function getSocialJob(id, dbConn = db) {
  const [rows] = await dbConn.execute(
    `SELECT sj.*, js.status as worker_job_status, js.started_at, js.finished_at, js.host_id,
            ss.platform, ss.account_name, ss.profile_url, ss.adapter_type, ss.execution_mode
     FROM social_jobs sj
     JOIN social_sources ss ON ss.id = sj.source_id
     JOIN jobs js ON js.id = sj.job_id
     WHERE sj.id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function selectDefaultHost(dbConn) {
  const [hosts] = await dbConn.execute(
    `SELECT id, name, status
     FROM hosts
     WHERE status != 'deleted'
     ORDER BY CASE WHEN status = 'online' THEN 0 WHEN status = 'offline' THEN 1 ELSE 2 END,
              id ASC
     LIMIT 1`
  );
  return hosts[0] || null;
}

async function createWorkerJobForSource(conn, source, socialJobInput) {
  const host = await selectDefaultHost(conn);
  if (!host) {
    throw new Error('No Worker host is registered. Start a Worker or create a host before creating a crawl job.');
  }

  const workerStatus = socialJobInput.schedule_type === 'manual' ? 'draft' : 'scheduled';
  const startMode = socialJobInput.schedule_type === 'manual' ? 'manual' : socialJobInput.schedule_type;
  const name = `${source.account_name} ${socialJobInput.crawl_mode} crawl`;

  const [jobRows] = await conn.execute(
    `INSERT INTO jobs (name, site_type, host_id, status, initial_urls, concurrency,
      auto_scroll_seconds, auto_scroll_max_rounds, page_timeout_seconds,
      max_retry_count, max_images, start_mode, scheduled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      name,
      source.platform === 'website' ? 'generic' : source.platform,
      host.id,
      workerStatus,
      JSON.stringify([source.profile_url]),
      1,
      5,
      2,
      30,
      2,
      socialJobInput.max_items,
      startMode,
      null
    ]
  );
  const workerJobId = jobRows[0].id;

  await conn.execute(
    `INSERT INTO page_tasks (job_id, assigned_host_id, task_type, dispatch_mode, target_url, priority, status)
     VALUES (?, ?, 'seed', 'seed_task', ?, 10, 'pending')`,
    [workerJobId, host.id, source.profile_url]
  );

  return { workerJobId, host };
}

router.get('/meta', (req, res) => {
  res.json({
    platforms: platforms.map((platform) => ({
      value: platform,
      execution_mode: executionModeForPlatform(platform),
      adapter: adapterForPlatform(platform),
      supported: platform === 'website',
      note: platform === 'website'
        ? 'Real public-page crawl through the distributed Worker.'
        : 'Architecture placeholder only. Real platform adapter is not implemented.'
    })),
    crawl_modes: crawlModes,
    schedule_types: scheduleTypes.map((type) => ({
      value: type,
      supported: !unsupportedScheduleTypes.includes(type),
      note: type === 'cron' ? 'Cron scheduling is not implemented in V1.' : null
    })),
    adapters: [
      { name: 'generic_public_page_adapter', platforms: ['website'], execution_mode: 'real' },
      { name: 'mock_social_adapter', platforms: platforms.filter((platform) => platform !== 'website'), execution_mode: 'mock' }
    ]
  });
});

router.get('/sources', async (req, res) => {
  try {
    const { platform, status } = req.query;
    const where = [];
    const params = [];
    if (platform) {
      where.push('ss.platform = ?');
      params.push(platform);
    }
    if (status) {
      where.push('ss.status = ?');
      params.push(status);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await db.execute(
      `SELECT ss.*,
              (SELECT COUNT(*) FROM social_jobs sj WHERE sj.source_id = ss.id) as job_count,
              (SELECT COUNT(*) FROM social_runs sr WHERE sr.source_id = ss.id) as run_count,
              (SELECT COUNT(*) FROM images img
               JOIN social_jobs sj_img ON sj_img.job_id = img.job_id
               WHERE sj_img.source_id = ss.id AND COALESCE(img.status, '') != 'deleted') as image_count,
              (SELECT sr_last.status FROM social_runs sr_last
               WHERE sr_last.source_id = ss.id
               ORDER BY sr_last.started_at DESC, sr_last.id DESC
               LIMIT 1) as last_run_status
       FROM social_sources ss
       ${whereSql}
       ORDER BY ss.created_at DESC`,
      params
    );

    res.json({ data: rows.map(publicSourceRow), total: rows.length });
  } catch (err) {
    console.error('[Social] list sources failed:', err);
    res.status(500).json({ error: '获取社媒来源失败', message: err.message });
  }
});

router.post('/sources', async (req, res) => {
  try {
    const platform = req.body.platform || 'website';
    const crawlMode = req.body.crawl_mode || 'historical';
    const scheduleType = req.body.schedule_type || 'manual';

    ensureChoice(platform, platforms, 'platform');
    ensureChoice(crawlMode, crawlModes, 'crawl_mode');
    ensureChoice(scheduleType, scheduleTypes, 'schedule_type');
    if (unsupportedScheduleTypes.includes(scheduleType)) {
      return res.status(400).json({ error: 'cron scheduling is not implemented in V1' });
    }

    const profileUrl = await validatePublicUrl(req.body.profile_url);
    const accountName = String(req.body.account_name || '').trim();
    if (!accountName) {
      return res.status(400).json({ error: 'account_name is required' });
    }

    const maxItems = Number(req.body.max_items || 50);
    if (!Number.isInteger(maxItems) || maxItems <= 0 || maxItems > 1000) {
      return res.status(400).json({ error: 'max_items must be between 1 and 1000' });
    }

    const executionMode = executionModeForPlatform(platform);
    const adapterType = adapterForPlatform(platform);
    const status = socialPlatforms.has(platform) ? 'unsupported' : 'active';
    const rateLimitPolicy = normalizeRateLimit(req.body.rate_limit_policy);
    const metadata = {
      public_content_only: true,
      real_platform_adapter: platform === 'website',
      mock_or_unsupported: platform !== 'website'
    };

    const [rows] = await db.execute(
      `INSERT INTO social_sources (platform, account_name, profile_url, crawl_mode, schedule_type,
        max_items, status, rate_limit_policy, notes, adapter_type, execution_mode, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        platform,
        accountName,
        profileUrl,
        crawlMode,
        scheduleType,
        maxItems,
        status,
        stringifyJson(rateLimitPolicy),
        String(req.body.notes || '').trim(),
        adapterType,
        executionMode,
        stringifyJson(metadata)
      ]
    );

    const source = await getSource(rows[0].id);
    res.status(201).json(publicSourceRow(source));
  } catch (err) {
    console.error('[Social] create source failed:', err);
    res.status(400).json({ error: err.message });
  }
});

router.patch('/sources/:id', async (req, res) => {
  try {
    const source = await getSource(req.params.id);
    if (!source) return res.status(404).json({ error: 'source not found' });

    const updates = [];
    const params = [];
    if (req.body.account_name !== undefined) {
      const accountName = String(req.body.account_name || '').trim();
      if (!accountName) return res.status(400).json({ error: 'account_name is required' });
      updates.push('account_name = ?');
      params.push(accountName);
    }
    if (req.body.profile_url !== undefined) {
      updates.push('profile_url = ?');
      params.push(await assertPublicHttpUrl(req.body.profile_url, 'profile_url'));
    }
    if (req.body.crawl_mode !== undefined) {
      ensureChoice(req.body.crawl_mode, crawlModes, 'crawl_mode');
      updates.push('crawl_mode = ?');
      params.push(req.body.crawl_mode);
    }
    if (req.body.schedule_type !== undefined) {
      ensureChoice(req.body.schedule_type, scheduleTypes, 'schedule_type');
      if (unsupportedScheduleTypes.includes(req.body.schedule_type)) {
        return res.status(400).json({ error: 'cron scheduling is not implemented in V1' });
      }
      updates.push('schedule_type = ?');
      params.push(req.body.schedule_type);
    }
    if (req.body.max_items !== undefined) {
      const maxItems = Number(req.body.max_items);
      if (!Number.isInteger(maxItems) || maxItems <= 0 || maxItems > 1000) {
        return res.status(400).json({ error: 'max_items must be between 1 and 1000' });
      }
      updates.push('max_items = ?');
      params.push(maxItems);
    }
    if (req.body.rate_limit_policy !== undefined) {
      updates.push('rate_limit_policy = ?');
      params.push(stringifyJson(normalizeRateLimit(req.body.rate_limit_policy)));
    }
    if (req.body.notes !== undefined) {
      updates.push('notes = ?');
      params.push(String(req.body.notes || '').trim());
    }
    if (req.body.status !== undefined) {
      const requestedStatus = String(req.body.status);
      const allowedStatuses = source.platform === 'website'
        ? ['active', 'disabled']
        : ['unsupported', 'disabled'];
      ensureChoice(requestedStatus, allowedStatuses, 'status');
      updates.push('status = ?');
      params.push(requestedStatus);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'no source fields to update' });

    updates.push('updated_at = NOW()');
    params.push(req.params.id);
    await db.execute(`UPDATE social_sources SET ${updates.join(', ')} WHERE id = ?`, params);
    const updated = await getSource(req.params.id);
    res.json(publicSourceRow(updated));
  } catch (err) {
    console.error('[Social] update source failed:', err);
    res.status(400).json({ error: err.message });
  }
});

router.get('/jobs', async (req, res) => {
  try {
    const { status, source_id } = req.query;
    const where = [];
    const params = [];
    if (status) {
      where.push('sj.status = ?');
      params.push(status);
    }
    if (source_id) {
      where.push('sj.source_id = ?');
      params.push(source_id);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await db.execute(
      `SELECT sj.*, js.status as worker_job_status, js.started_at, js.finished_at,
              ss.platform, ss.account_name, ss.profile_url, ss.adapter_type, ss.execution_mode,
              (SELECT COUNT(*) FROM social_runs sr WHERE sr.social_job_id = sj.id) as run_count,
              (SELECT COUNT(*) FROM images img
               WHERE img.job_id = sj.job_id AND COALESCE(img.status, '') != 'deleted') as image_count,
              lr.id as last_run_id, lr.status as last_run_status,
              lr.started_at as last_run_started_at, lr.finished_at as last_run_finished_at,
              lr.image_count as last_run_image_count, lr.error_message as last_run_error
       FROM social_jobs sj
       JOIN social_sources ss ON ss.id = sj.source_id
       JOIN jobs js ON js.id = sj.job_id
       LEFT JOIN social_runs lr ON lr.id = (
         SELECT sr2.id FROM social_runs sr2
         WHERE sr2.social_job_id = sj.id
         ORDER BY sr2.started_at DESC, sr2.id DESC
         LIMIT 1
       )
       ${whereSql}
       ORDER BY sj.created_at DESC`,
      params
    );

    res.json({ data: rows.map(publicJobRow), total: rows.length });
  } catch (err) {
    console.error('[Social] list jobs failed:', err);
    res.status(500).json({ error: '获取社媒采集任务失败', message: err.message });
  }
});

router.post('/jobs', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const source = await getSource(req.body.source_id, conn);
    if (!source) {
      await conn.rollback();
      return res.status(404).json({ error: 'source not found' });
    }
    if (source.status !== 'active') {
      await conn.rollback();
      return res.status(400).json({
        error: `source is ${source.status}; only website sources are executable in V1`
      });
    }

    const crawlMode = req.body.crawl_mode || source.crawl_mode || 'historical';
    const scheduleType = req.body.schedule_type || source.schedule_type || 'manual';
    ensureChoice(crawlMode, crawlModes, 'crawl_mode');
    ensureChoice(scheduleType, scheduleTypes, 'schedule_type');
    if (unsupportedScheduleTypes.includes(scheduleType)) {
      await conn.rollback();
      return res.status(400).json({ error: 'cron scheduling is not implemented in V1' });
    }

    const maxItems = Number(req.body.max_items || source.max_items || 50);
    if (!Number.isInteger(maxItems) || maxItems <= 0 || maxItems > 1000) {
      await conn.rollback();
      return res.status(400).json({ error: 'max_items must be between 1 and 1000' });
    }
    const intervalSeconds = scheduleType === 'interval'
      ? normalizeIntervalSeconds(req.body.interval_seconds)
      : null;

    const socialJobInput = {
      crawl_mode: crawlMode,
      schedule_type: scheduleType,
      max_items: maxItems
    };
    const { workerJobId } = await createWorkerJobForSource(conn, source, socialJobInput);
    const socialStatus = scheduleType === 'manual' ? 'draft' : 'scheduled';

    const [rows] = await conn.execute(
      `INSERT INTO social_jobs (source_id, job_id, crawl_mode, schedule_type, max_items,
        status, interval_seconds, cron_expression, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        source.id,
        workerJobId,
        crawlMode,
        scheduleType,
        maxItems,
        socialStatus,
        intervalSeconds,
        req.body.cron_expression || null,
        String(req.body.notes || '').trim()
      ]
    );

    await conn.commit();
    const job = await getSocialJob(rows[0].id);
    await logger.info('social_job_create', `Created social job #${rows[0].id}`, {
      jobId: workerJobId,
      socialJobId: rows[0].id,
      sourceId: source.id
    });
    res.status(201).json(publicJobRow(job));
  } catch (err) {
    await conn.rollback();
    console.error('[Social] create job failed:', err);
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
});

router.get('/jobs/:id/status', async (req, res) => {
  try {
    const job = await getSocialJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'job not found' });
    res.json(publicJobRow(job));
  } catch (err) {
    res.status(500).json({ error: '获取任务状态失败', message: err.message });
  }
});

router.post('/jobs/:id/run', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const job = await getSocialJob(req.params.id, conn);
    if (!job) {
      await conn.rollback();
      return res.status(404).json({ error: 'job not found' });
    }
    if (job.execution_mode !== 'real') {
      await conn.rollback();
      return res.status(400).json({ error: 'Only website public-page jobs are executable in V1' });
    }
    if (unsupportedScheduleTypes.includes(job.schedule_type)) {
      await conn.rollback();
      return res.status(400).json({ error: 'cron scheduling is not implemented in V1' });
    }
    if (['running', 'queued'].includes(job.worker_job_status)) {
      await conn.rollback();
      return res.status(400).json({ error: `worker job is already ${job.worker_job_status}` });
    }

    const [runRows] = await conn.execute(
      `INSERT INTO social_runs (social_job_id, source_id, job_id, status, started_at)
       VALUES (?, ?, ?, 'queued', NOW()) RETURNING id`,
      [job.id, job.source_id, job.job_id]
    );
    const runId = runRows[0].id;

    await conn.execute(
      `UPDATE jobs SET status = 'queued', started_at = NULL, finished_at = NULL, updated_at = NOW()
       WHERE id = ?`,
      [job.job_id]
    );
    await conn.execute(
      `UPDATE page_tasks
       SET status = 'pending', retry_count = 0, error_message = NULL, started_at = NULL,
           finished_at = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
       WHERE job_id = ? AND status IN ('draft','pending','retry_waiting','failed','cancelled')`,
      [job.job_id]
    );
    const [pendingTasks] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM page_tasks
       WHERE job_id = ? AND status IN ('pending','running','retry_waiting','assigned')`,
      [job.job_id]
    );
    if (Number(pendingTasks[0]?.cnt || 0) === 0) {
      await conn.execute(
        `INSERT INTO page_tasks (job_id, assigned_host_id, task_type, dispatch_mode, target_url, priority, status)
         VALUES (?, ?, 'seed', 'seed_task', ?, 10, 'pending')`,
        [job.job_id, job.host_id, job.profile_url]
      );
    }
    await conn.execute(
      `UPDATE social_jobs SET status = 'queued', last_run_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [job.id]
    );

    await conn.commit();
    await logger.info('social_job_run', `Queued social job #${job.id}`, {
      jobId: job.job_id,
      socialJobId: job.id,
      socialRunId: runId
    });

    const refreshedJob = await getSocialJob(job.id);
    const [runs] = await db.execute('SELECT * FROM social_runs WHERE id = ?', [runId]);
    res.json({ job: publicJobRow(refreshedJob), run: runs[0] });
  } catch (err) {
    await conn.rollback();
    console.error('[Social] run job failed:', err);
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
});

router.post('/jobs/:id/cancel', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const job = await getSocialJob(req.params.id, conn);
    if (!job) {
      await conn.rollback();
      return res.status(404).json({ error: 'job not found' });
    }

    await conn.execute(
      `UPDATE jobs SET status = 'cancelled', updated_at = NOW()
       WHERE id = ? AND status IN ('queued','running','scheduled')`,
      [job.job_id]
    );
    await conn.execute(
      `UPDATE page_tasks
       SET status = 'cancelled', lease_token = NULL, lease_expires_at = NULL, updated_at = NOW()
       WHERE job_id = ? AND status IN ('pending','running','retry_waiting','assigned')`,
      [job.job_id]
    );
    await conn.execute(
      `UPDATE social_runs
       SET status = 'cancelled', finished_at = NOW(), error_message = 'Cancelled by user', updated_at = NOW()
       WHERE job_id = ? AND status IN ('queued','running','retry_waiting')`,
      [job.job_id]
    );
    await conn.execute(
      `UPDATE social_jobs SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
      [job.id]
    );

    await conn.commit();
    await logger.info('social_job_cancel', `Cancelled social job #${job.id}`, {
      jobId: job.job_id,
      socialJobId: job.id
    });

    const refreshedJob = await getSocialJob(job.id);
    res.json({ job: publicJobRow(refreshedJob), message: 'job cancelled' });
  } catch (err) {
    await conn.rollback();
    console.error('[Social] cancel job failed:', err);
    res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
});

router.get('/runs', async (req, res) => {
  try {
    const { job_id, source_id } = req.query;
    const where = [];
    const params = [];
    if (job_id) {
      where.push('sr.social_job_id = ?');
      params.push(job_id);
    }
    if (source_id) {
      where.push('sr.source_id = ?');
      params.push(source_id);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [rows] = await db.execute(
      `SELECT sr.*, ss.account_name, ss.profile_url, ss.platform,
              sj.schedule_type, sj.crawl_mode,
              js.status as worker_job_status
       FROM social_runs sr
       JOIN social_sources ss ON ss.id = sr.source_id
       JOIN social_jobs sj ON sj.id = sr.social_job_id
       JOIN jobs js ON js.id = sr.job_id
       ${whereSql}
       ORDER BY sr.started_at DESC, sr.id DESC`,
      params
    );

    const data = [];
    for (const run of rows) {
      const [images] = await db.execute(
        `SELECT img.*, ss.account_name, ss.profile_url
         FROM images img
         JOIN social_runs sr ON sr.job_id = img.job_id
         JOIN social_sources ss ON ss.id = sr.source_id
         WHERE sr.id = ? AND COALESCE(img.status, '') != 'deleted'
         ORDER BY img.created_at DESC, img.id DESC
         LIMIT 100`,
        [run.id]
      );
      data.push({
        ...run,
        image_count: Number(run.image_count || images.length || 0),
        images: images.map(publicImageRow)
      });
    }

    res.json({ data, total: data.length });
  } catch (err) {
    console.error('[Social] list runs failed:', err);
    res.status(500).json({ error: '获取运行历史失败', message: err.message });
  }
});

module.exports = router;
