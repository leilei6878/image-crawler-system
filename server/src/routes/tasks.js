const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../services/logger');

function passesFilter(img, filter) {
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
    const { host_id, max_tasks = 1 } = req.body;
    if (!host_id) return res.status(400).json({ error: '缺少host_id' });

    const [hosts] = await conn.execute(
      'SELECT id, max_concurrency, status FROM hosts WHERE id = ?', [host_id]
    );
    if (hosts.length === 0) return res.status(404).json({ error: '主机不存在' });
    if (hosts[0].status !== 'online') return res.json({ tasks: [], message: '主机非在线状态' });

    const host = hosts[0];

    const [runningCount] = await conn.execute(
      `SELECT COUNT(*) as cnt FROM page_tasks WHERE assigned_host_id = ? AND status = 'running'`,
      [host_id]
    );
    const availableSlots = Math.max(0, host.max_concurrency - parseInt(runningCount[0].cnt));
    const pullCount = Math.min(availableSlots, parseInt(max_tasks));

    if (pullCount <= 0) return res.json({ tasks: [], message: '无可用槽位' });

    const [pendingTasks] = await conn.execute(
      `SELECT pt.*, j.concurrency as job_concurrency, j.status as job_status,
              j.site_type, j.auto_scroll_seconds, j.auto_scroll_max_rounds,
              j.page_timeout_seconds, j.max_retry_count
       FROM page_tasks pt
       JOIN jobs j ON pt.job_id = j.id
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

      const [updateResult] = await conn.execute(
        `UPDATE page_tasks SET status = 'running', started_at = NOW(), updated_at = NOW()
         WHERE id = ? AND status IN ('pending','retry_waiting') RETURNING id`,
        [task.id]
      );
      if (!updateResult || updateResult.length === 0) continue;

      if (task.job_status === 'queued') {
        await conn.execute(
          `UPDATE jobs SET status = 'running', started_at = COALESCE(started_at, NOW()), updated_at = NOW() WHERE id = ?`,
          [task.job_id]
        );
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

    res.json({ tasks: assignedTasks });
  } catch (err) {
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
      error_message, screenshot_path, host_id
    } = req.body;

    const [tasks] = await conn.execute('SELECT * FROM page_tasks WHERE id = ?', [page_task_id]);
    if (tasks.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: '任务不存在' });
    }

    const task = tasks[0];

    if (status === 'success') {
      await conn.execute(
        `UPDATE page_tasks SET status = 'success', finished_at = NOW(), updated_at = NOW() WHERE id = ?`,
        [page_task_id]
      );

      let savedCount = 0;
      for (const img of images) {

        await conn.execute(
          `INSERT INTO images (job_id, host_id, page_task_id, image_url, detail_page_url, source_page_url,
            author_name, author_url, width, height, like_count, favorite_count, comment_count, share_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT DO NOTHING`,
          [task.job_id, host_id || task.assigned_host_id, page_task_id,
           img.image_url, img.detail_page_url || null, img.source_page_url || null,
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
        const [existing] = await conn.execute(
          `SELECT id FROM page_tasks WHERE target_url = ? AND job_id = ? AND status != 'cancelled'`,
          [newTask.target_url, task.job_id]
        );
        if (existing.length === 0) {
          await conn.execute(
            `INSERT INTO page_tasks (job_id, assigned_host_id, parent_task_id, task_type, dispatch_mode, target_url, priority, status)
             VALUES (?, ?, ?, ?, 'seed_task', ?, ?, 'pending')`,
            [task.job_id, task.assigned_host_id, page_task_id,
             newTask.task_type || 'detail', newTask.target_url, newTask.priority || 5]
          );
        }
      }

    } else if (status === 'failed') {
      const maxRetry = task.max_retry_count || 3;
      if (task.retry_count < maxRetry) {
        await conn.execute(
          `UPDATE page_tasks SET status = 'retry_waiting', retry_count = retry_count + 1,
           error_message = ?, updated_at = NOW() WHERE id = ?`,
          [error_message || null, page_task_id]
        );
      } else {
        await conn.execute(
          `UPDATE page_tasks SET status = 'failed', finished_at = NOW(), error_message = ?, updated_at = NOW() WHERE id = ?`,
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
      await conn.execute(
        `UPDATE jobs SET status = 'completed', finished_at = NOW(), updated_at = NOW()
         WHERE id = ? AND status = 'running'`,
        [task.job_id]
      );
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
