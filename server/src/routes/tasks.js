const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../db');
const logger = require('../services/logger');
const { assertPublicHttpUrl } = require('../services/urlPolicy');
const { authenticateWorker, secretsEqual } = require('../services/workerAuth');

function dbDate(date = new Date()) {
  return date;
}

function leaseDurationSeconds(task) {
  const pageTimeout = parseInt(task.page_timeout_seconds, 10) || 60;
  const scrollTimeout = parseInt(task.auto_scroll_seconds, 10) || 0;
  return Math.max(pageTimeout + scrollTimeout + 90, 180);
}

function passesFilter(img, filter, siteType) {
  const mode = filter.logic_mode || 'and';

  function parsePositiveInt(value) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function passesMinThreshold(rawValue, rawThreshold) {
    const threshold = parsePositiveInt(rawThreshold);
    if (threshold === null || threshold <= 0) {
      return true;
    }

    const value = parsePositiveInt(rawValue);
    if (value === null) {
      return false;
    }

    return value >= threshold;
  }

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
  checks.push(passesMinThreshold(img.like_count, filter.min_like));
  checks.push(passesMinThreshold(img.favorite_count, filter.min_favorite));
  checks.push(passesMinThreshold(img.comment_count, filter.min_comment));
  checks.push(passesMinThreshold(img.share_count, filter.min_share));
  checks.push(passesMinThreshold(img.width, filter.min_width));
  checks.push(passesMinThreshold(img.height, filter.min_height));

  if (checks.length === 0) return true;

  if (mode === 'or') {
    return checks.some(c => c);
  }
  return checks.every(c => c);
}

// Worker拉取任务
router.post('/pull', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { host_id, host_key, max_tasks = 1 } = req.body;
    const requestedTasks = parseInt(max_tasks, 10);
    if (!Number.isInteger(requestedTasks) || requestedTasks <= 0 || requestedTasks > 20) {
      await conn.rollback();
      return res.status(400).json({ error: 'max_tasks must be between 1 and 20' });
    }

    const auth = await authenticateWorker(conn, { hostId: host_id, hostKey: host_key }, { lock: true });
    if (!auth.ok) {
      await conn.rollback();
      return res.status(auth.status).json({ error: auth.message });
    }

    const [hosts] = await conn.execute(
      'SELECT id, max_concurrency, status FROM hosts WHERE id = ?', [auth.host.id]
    );
    if (hosts[0].status !== 'online') {
      await conn.commit();
      return res.json({ tasks: [], message: '主机非在线状态' });
    }

    const host = hosts[0];

    const [runningCount] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM page_tasks WHERE assigned_host_id = ? AND status = 'running'`,
      [host_id]
    );
    const availableSlots = Math.max(0, host.max_concurrency - parseInt(runningCount[0].cnt));
    const pullCount = Math.min(availableSlots, requestedTasks);

    if (pullCount <= 0) {
      await conn.commit();
      return res.json({ tasks: [], message: '无可用槽位' });
    }

    const [pendingTasks] = await conn.execute(
      `SELECT pt.*, j.concurrency as job_concurrency, j.status as job_status,
              j.site_type, j.auto_scroll_seconds, j.auto_scroll_max_rounds,
              j.page_timeout_seconds, j.max_retry_count, j.max_images,
              ss.id as source_id, ss.rate_limit_policy
       FROM page_tasks pt
       JOIN jobs j ON pt.job_id = j.id
       LEFT JOIN social_jobs sj ON sj.job_id = pt.job_id
       LEFT JOIN social_sources ss ON ss.id = sj.source_id
       WHERE pt.assigned_host_id = ?
         AND pt.status IN ('pending', 'retry_waiting')
         AND j.status IN ('queued', 'running')
       ORDER BY pt.priority DESC, pt.created_at ASC
       LIMIT ${parseInt(pullCount * 3)}`,
      [host_id]
    );

    const assignedTasks = [];
    const jobRunningCounts = {};

    for (const task of pendingTasks) {
      if (assignedTasks.length >= pullCount) break;

      if (!jobRunningCounts[task.job_id]) {
        const [jrc] = await conn.execute(
          `SELECT COUNT(*) as cnt FROM page_tasks WHERE job_id = ? AND status = 'running'`,
          [task.job_id]
        );
        jobRunningCounts[task.job_id] = parseInt(jrc[0].cnt);
      }

      if (jobRunningCounts[task.job_id] >= task.job_concurrency) continue;

      const leaseToken = crypto.randomUUID();
      const leaseExpiresAt = dbDate(new Date(Date.now() + leaseDurationSeconds(task) * 1000));
      const [updateResult] = await conn.execute(
        `UPDATE page_tasks SET status = 'running', started_at = NOW(),
             lease_token = ?, lease_expires_at = ?, updated_at = NOW()
         WHERE id = ? AND status IN ('pending','retry_waiting') RETURNING id`,
        [leaseToken, leaseExpiresAt, task.id]
      );
      if (!updateResult || updateResult.length === 0) continue;

      if (task.job_status === 'queued') {
        await conn.execute(
          `UPDATE jobs SET status = 'running', started_at = COALESCE(started_at, NOW()), updated_at = NOW() WHERE id = ?`,
          [task.job_id]
        );
      }

      try {
        await conn.execute(
          `UPDATE social_runs SET status = 'running', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
           WHERE job_id = ? AND status IN ('queued', 'retry_waiting')`,
          [task.job_id]
        );
        await conn.execute(
          `UPDATE social_jobs SET status = 'running', updated_at = NOW()
           WHERE job_id = ? AND status IN ('queued', 'retry_waiting')`,
          [task.job_id]
        );
      } catch (socialErr) {
        console.warn('[Tasks] social run claim sync skipped:', socialErr.message);
      }

      jobRunningCounts[task.job_id]++;

      let taskFilters = null;
      try {
        const [filterRows] = await conn.execute('SELECT * FROM job_filters WHERE job_id = ?', [task.job_id]);
        if (filterRows.length > 0) {
          const f = filterRows[0];
          taskFilters = {
            logic_mode: f.logic_mode,
            min_like: f.min_like,
            min_favorite: f.min_favorite,
            min_comment: f.min_comment,
            min_share: f.min_share,
            min_width: f.min_width,
            min_height: f.min_height,
            exclude_video: f.exclude_video,
            exclude_collage: f.exclude_collage,
          };
        }
      } catch {}

      assignedTasks.push({
        id: task.id,
        job_id: task.job_id,
        task_type: task.task_type,
        target_url: task.target_url,
        site_type: task.site_type,
        auto_scroll_seconds: task.auto_scroll_seconds,
        auto_scroll_max_rounds: task.auto_scroll_max_rounds,
        page_timeout_seconds: task.page_timeout_seconds,
        max_retry_count: task.max_retry_count,
        max_images: task.max_images,
        source_id: task.source_id,
        rate_limit_policy: task.rate_limit_policy,
        lease_token: leaseToken,
        lease_expires_at: leaseExpiresAt,
        retry_count: task.retry_count,
        filters: taskFilters,
        source_image_id: task.source_image_id
      });
    }

    await conn.execute(
      `UPDATE hosts SET
        running_count = (SELECT COUNT(*) FROM page_tasks WHERE assigned_host_id = ? AND status = 'running'),
        pending_count = (SELECT COUNT(*) FROM page_tasks WHERE assigned_host_id = ? AND status IN ('pending','retry_waiting')),
        updated_at = NOW()
       WHERE id = ?`,
      [host_id, host_id, host_id]
    );

    await conn.commit();
    res.json({ tasks: assignedTasks });
  } catch (err) {
    await conn.rollback();
    console.error('[Tasks] 拉取任务失败:', err);
    res.status(500).json({ error: '拉取任务失败' });
  } finally {
    conn.release();
  }
});

// Worker回传结果
router.post('/report', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const {
      page_task_id, status, images = [], new_page_tasks = [],
      error_message, screenshot_path, host_id, host_key, lease_token
    } = req.body;

    if (!['success', 'failed'].includes(status)) {
      await conn.rollback();
      return res.status(400).json({ error: 'status must be success or failed' });
    }
    if (!Array.isArray(images) || images.length > 1000) {
      await conn.rollback();
      return res.status(400).json({ error: 'images must be an array with at most 1000 items' });
    }
    if (!Array.isArray(new_page_tasks) || new_page_tasks.length > 1000) {
      await conn.rollback();
      return res.status(400).json({ error: 'new_page_tasks must be an array with at most 1000 items' });
    }

    const [tasks] = await conn.execute('SELECT * FROM page_tasks WHERE id = ? FOR UPDATE', [page_task_id]);
    if (tasks.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: '任务不存在' });
    }

    const task = tasks[0];
    const auth = await authenticateWorker(conn, { hostId: host_id, hostKey: host_key });
    if (!auth.ok) {
      await conn.rollback();
      return res.status(auth.status).json({ error: auth.message });
    }
    if (Number(auth.host.id) !== Number(task.assigned_host_id)) {
      await conn.rollback();
      return res.status(403).json({ error: 'worker is not assigned to this task' });
    }
    if (task.status === 'cancelled') {
      await conn.commit();
      return res.json({ message: '任务已取消，迟到回传已忽略' });
    }
    if (['success', 'failed', 'retry_waiting'].includes(task.status)) {
      await conn.commit();
      return res.json({ message: '重复回传已忽略' });
    }
    const leaseExpiresAt = new Date(task.lease_expires_at).getTime();
    if (!secretsEqual(lease_token, task.lease_token) || !Number.isFinite(leaseExpiresAt) || leaseExpiresAt <= Date.now()) {
      await conn.rollback();
      return res.status(409).json({ error: 'task lease is missing or expired' });
    }

    if (status === 'success') {
      await conn.execute(
        `UPDATE page_tasks SET status = 'success', finished_at = NOW(),
           lease_token = NULL, lease_expires_at = NULL, updated_at = NOW() WHERE id = ?`,
        [page_task_id]
      );

      await conn.execute('SELECT id FROM jobs WHERE id = ? FOR UPDATE', [task.job_id]);
      let savedCount = 0;
      const seenImageUrls = new Set();
      for (const img of images) {
        if (!img || !img.image_url) {
          continue;
        }
        let normalizedImageUrl;
        try {
          normalizedImageUrl = await assertPublicHttpUrl(img.image_url, 'images.image_url');
        } catch (urlError) {
          console.warn(`[Report] skipped unsafe image URL: ${urlError.message}`);
          continue;
        }
        if (seenImageUrls.has(normalizedImageUrl)) continue;
        seenImageUrls.add(normalizedImageUrl);

        const [existingImages] = await conn.execute(
          `SELECT id FROM images WHERE job_id = ? AND image_url = ? LIMIT 1`,
          [task.job_id, normalizedImageUrl]
        );
        if (existingImages.length > 0) {
          continue;
        }

        await conn.execute(
          `INSERT INTO images (job_id, host_id, page_task_id, image_url, detail_page_url, source_page_url,
            author_name, author_url, width, height, like_count, favorite_count, comment_count, share_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT DO NOTHING`,
          [task.job_id, host_id || task.assigned_host_id, page_task_id,
           normalizedImageUrl, img.detail_page_url || null, img.source_page_url || null,
           img.author_name || null, img.author_url || null,
           img.width ?? null, img.height ?? null,
           img.like_count ?? null, img.favorite_count ?? null,
           img.comment_count ?? null, img.share_count ?? null]
        );
        savedCount++;
      }

      console.log(`[Report] Job#${task.job_id} Task#${page_task_id}: 收到${images.length}张, 保存${savedCount}张`);

      // 创建新的子任务
      for (const newTask of new_page_tasks) {
        let normalizedTargetUrl;
        try {
          normalizedTargetUrl = await assertPublicHttpUrl(newTask.target_url, 'new_page_tasks.target_url');
        } catch (err) {
          console.warn(`[Report] skipped unsafe child task URL: ${err.message}`);
          continue;
        }

        const [existing] = await conn.execute(
          `SELECT id FROM page_tasks WHERE target_url = ? AND job_id = ? AND status != 'cancelled'`,
          [normalizedTargetUrl, task.job_id]
        );
        if (existing.length === 0) {
          await conn.execute(
            `INSERT INTO page_tasks (job_id, assigned_host_id, parent_task_id, task_type, dispatch_mode, target_url, priority, status)
             VALUES (?, ?, ?, ?, 'seed_task', ?, ?, 'pending')`,
            [task.job_id, task.assigned_host_id, page_task_id,
             newTask.task_type || 'detail', normalizedTargetUrl, newTask.priority || 5]
          );
        }
      }

    } else if (status === 'failed') {
      const maxRetry = task.max_retry_count || 3;
      if (task.retry_count < maxRetry) {
        await conn.execute(
          `UPDATE page_tasks SET status = 'retry_waiting', retry_count = retry_count + 1,
           error_message = ?, lease_token = NULL, lease_expires_at = NULL, updated_at = NOW() WHERE id = ?`,
          [error_message || null, page_task_id]
        );
        await conn.execute(
          `UPDATE social_runs SET status = 'retry_waiting', error_message = ?, updated_at = NOW()
           WHERE job_id = ? AND status = 'running'`,
          [error_message || 'Worker task failed; waiting for retry', task.job_id]
        );
        await conn.execute(
          `UPDATE social_jobs SET status = 'retry_waiting', updated_at = NOW()
           WHERE job_id = ? AND status = 'running'`,
          [task.job_id]
        );
      } else {
        await conn.execute(
          `UPDATE page_tasks SET status = 'failed', finished_at = NOW(), error_message = ?,
           lease_token = NULL, lease_expires_at = NULL, updated_at = NOW() WHERE id = ?`,
          [error_message || null, page_task_id]
        );
        await logger.error('task_failed', `任务 #${page_task_id} 失败`, { jobId: task.job_id, pageTaskId: page_task_id });
      }
    }

    if (screenshot_path) {
      await conn.execute(
        `INSERT INTO job_screenshots (page_task_id, screenshot_path) VALUES (?, ?)`,
        [page_task_id, screenshot_path]
      );
    }

    const hostId = host_id || task.assigned_host_id;
    await conn.execute(
      `UPDATE hosts SET
        running_count = (SELECT COUNT(*) FROM page_tasks WHERE assigned_host_id = ? AND status = 'running'),
        pending_count = (SELECT COUNT(*) FROM page_tasks WHERE assigned_host_id = ? AND status IN ('pending','retry_waiting')),
        updated_at = NOW()
       WHERE id = ?`,
      [hostId, hostId, hostId]
    );

    const [remaining] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM page_tasks
       WHERE job_id = ? AND status IN ('pending','running','retry_waiting','assigned')`,
      [task.job_id]
    );

    if (parseInt(remaining[0].cnt) === 0) {
      const [taskStats] = await conn.execute(
        `SELECT
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count
         FROM page_tasks WHERE job_id = ?`,
        [task.job_id]
      );
      const successCount = parseInt(taskStats[0]?.success_count || 0, 10);
      const failedCount = parseInt(taskStats[0]?.failed_count || 0, 10);
      const finalJobStatus = failedCount > 0
        ? (successCount > 0 ? 'partial_failed' : 'failed')
        : 'completed';

      await conn.execute(
        `UPDATE jobs SET status = ?, finished_at = NOW(), updated_at = NOW()
         WHERE id = ? AND status = 'running'`,
        [finalJobStatus, task.job_id]
      );

      try {
        const [imageStats] = await conn.execute(
          `SELECT COUNT(*) as image_count FROM images
           WHERE job_id = ? AND COALESCE(status, '') != 'deleted'`,
          [task.job_id]
        );
        const imageCount = parseInt(imageStats[0]?.image_count || 0, 10);
        const [socialRuns] = await conn.execute(
          `SELECT sr.id, sr.social_job_id, sr.source_id, sj.schedule_type, sj.interval_seconds
           FROM social_runs sr
           JOIN social_jobs sj ON sj.id = sr.social_job_id
           WHERE sr.job_id = ? AND sr.status IN ('queued','running','retry_waiting')
           ORDER BY sr.started_at DESC, sr.id DESC
           LIMIT 1`,
          [task.job_id]
        );

        if (socialRuns.length > 0) {
          const socialRun = socialRuns[0];
          const nextRunAt = socialRun.schedule_type === 'interval'
            ? dbDate(new Date(Date.now() + Math.max(parseInt(socialRun.interval_seconds || 3600, 10), 60) * 1000))
            : null;
          await conn.execute(
            `UPDATE social_runs
             SET status = ?, finished_at = NOW(), image_count = ?, error_message = ?, updated_at = NOW()
             WHERE id = ?`,
            [
              finalJobStatus,
              imageCount,
              failedCount > 0 ? `${failedCount} task(s) failed` : null,
              socialRun.id
            ]
          );
          await conn.execute(
            socialRun.schedule_type === 'interval'
              ? `UPDATE social_jobs
                 SET status = 'scheduled', last_run_at = NOW(), next_run_at = ?, updated_at = NOW()
                 WHERE id = ?`
              : `UPDATE social_jobs SET status = ?, updated_at = NOW() WHERE id = ?`,
            socialRun.schedule_type === 'interval'
              ? [nextRunAt, socialRun.social_job_id]
              : [finalJobStatus, socialRun.social_job_id]
          );
          if (socialRun.schedule_type === 'interval') {
            await conn.execute(
              `UPDATE jobs SET status = 'scheduled', scheduled_at = ?, updated_at = NOW()
               WHERE id = ? AND status IN ('completed','failed','partial_failed')`,
              [nextRunAt, task.job_id]
            );
          }
          await conn.execute(
            `UPDATE social_sources SET last_crawled_at = NOW(), updated_at = NOW() WHERE id = ?`,
            [socialRun.source_id]
          );
        }
      } catch (socialErr) {
        console.warn('[Tasks] social run sync skipped:', socialErr.message);
      }
    }

    await conn.commit();
    res.json({ message: '结果回传成功' });
  } catch (err) {
    await conn.rollback();
    console.error('[Tasks] 回传结果失败:', err);
    res.status(500).json({ error: '回传结果失败', message: err.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
