const cron = require('node-cron');
const db = require('../db');
const logger = require('./logger');

function dbDate(date = new Date()) {
  return date;
}

function toInt(value, fallback = 0) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function getHeartbeatTimeoutSeconds(dbConn) {
  const [settings] = await dbConn.execute(
    `SELECT setting_value FROM system_settings WHERE setting_key = 'heartbeat_timeout_seconds'`
  );
  return settings.length > 0 ? toInt(settings[0].setting_value, 90) : 90;
}

async function syncSocialCompletion(dbConn, jobId, finalStatus, imageCount, errorMessage) {
  const [socialRuns] = await dbConn.execute(
    `SELECT sr.id, sr.social_job_id, sr.source_id, sj.schedule_type, sj.interval_seconds
     FROM social_runs sr
     JOIN social_jobs sj ON sj.id = sr.social_job_id
     WHERE sr.job_id = ? AND sr.status IN ('queued','running','retry_waiting')
     ORDER BY sr.started_at DESC, sr.id DESC
     LIMIT 1`,
    [jobId]
  );

  if (socialRuns.length === 0) return;

  const run = socialRuns[0];
  await dbConn.execute(
    `UPDATE social_runs
     SET status = ?, finished_at = NOW(), image_count = ?, error_message = ?, updated_at = NOW()
     WHERE id = ?`,
    [finalStatus, imageCount, errorMessage, run.id]
  );

  if (run.schedule_type === 'interval') {
    const intervalSeconds = Math.max(toInt(run.interval_seconds, 3600), 60);
    const nextRunAt = dbDate(new Date(Date.now() + intervalSeconds * 1000));
    await dbConn.execute(
      `UPDATE social_jobs
       SET status = 'scheduled', last_run_at = NOW(), next_run_at = ?, updated_at = NOW()
       WHERE id = ?`,
      [nextRunAt, run.social_job_id]
    );
    await dbConn.execute(
      `UPDATE jobs SET status = 'scheduled', scheduled_at = ?, updated_at = NOW()
       WHERE id = ? AND status IN ('completed','failed','partial_failed')`,
      [nextRunAt, jobId]
    );
  } else {
    await dbConn.execute(
      `UPDATE social_jobs SET status = ?, updated_at = NOW() WHERE id = ?`,
      [finalStatus, run.social_job_id]
    );
  }

  await dbConn.execute(
    `UPDATE social_sources SET last_crawled_at = NOW(), updated_at = NOW() WHERE id = ?`,
    [run.source_id]
  );
}

async function finalizeJobIfDone(dbConn, jobId) {
  const [remaining] = await dbConn.execute(
    `SELECT COUNT(*) as cnt FROM page_tasks
     WHERE job_id = ? AND status IN ('pending','running','retry_waiting','assigned')`,
    [jobId]
  );

  if (toInt(remaining[0]?.cnt, 0) > 0) return false;

  const [taskStats] = await dbConn.execute(
    `SELECT
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count
     FROM page_tasks WHERE job_id = ?`,
    [jobId]
  );
  const successCount = toInt(taskStats[0]?.success_count, 0);
  const failedCount = toInt(taskStats[0]?.failed_count, 0);
  const finalStatus = failedCount > 0
    ? (successCount > 0 ? 'partial_failed' : 'failed')
    : 'completed';

  const [imageStats] = await dbConn.execute(
    `SELECT COUNT(*) as image_count FROM images
     WHERE job_id = ? AND COALESCE(status, '') != 'deleted'`,
    [jobId]
  );
  const imageCount = toInt(imageStats[0]?.image_count, 0);
  const errorMessage = failedCount > 0 ? `${failedCount} task(s) failed` : null;

  await dbConn.execute(
    `UPDATE jobs SET status = ?, finished_at = NOW(), updated_at = NOW()
     WHERE id = ? AND status IN ('queued','running')`,
    [finalStatus, jobId]
  );

  try {
    await syncSocialCompletion(dbConn, jobId, finalStatus, imageCount, errorMessage);
  } catch (err) {
    console.warn('[Scheduler] social completion sync skipped:', err.message);
  }

  await logger.info('job_complete', `任务 #${jobId} 已结束: ${finalStatus}`, { jobId, status: finalStatus });
  console.log(`[Scheduler] job #${jobId} finalized as ${finalStatus}`);
  return true;
}

class Scheduler {
  start() {
    cron.schedule('*/30 * * * * *', () => this.queueDueJobs());
    cron.schedule('*/30 * * * * *', () => this.recoverTimedOutTasks());
    cron.schedule('*/30 * * * * *', () => this.updateJobStatuses());
    cron.schedule('*/60 * * * * *', () => this.syncHostCounts());
    cron.schedule('*/30 * * * * *', () => this.checkHeartbeatTimeouts());
  }

  async queueDueJobs() {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [socialJobs] = await conn.execute(
        `SELECT sj.id, sj.job_id, sj.source_id, sj.interval_seconds,
                ss.profile_url, js.host_id
         FROM social_jobs sj
         JOIN social_sources ss ON ss.id = sj.source_id
         JOIN jobs js ON js.id = sj.job_id
         WHERE sj.status = 'scheduled'
           AND sj.schedule_type = 'interval'
           AND ss.execution_mode = 'real'
           AND (sj.next_run_at IS NULL OR sj.next_run_at <= NOW())
         FOR UPDATE`
      );

      for (const job of socialJobs) {
        const [pendingTasks] = await conn.execute(
          `SELECT COUNT(*) as cnt FROM page_tasks
           WHERE job_id = ? AND status IN ('pending','running','retry_waiting','assigned')`,
          [job.job_id]
        );

        if (toInt(pendingTasks[0]?.cnt, 0) === 0) {
          await conn.execute(
            `INSERT INTO page_tasks (job_id, assigned_host_id, task_type, dispatch_mode, target_url, priority, status)
             VALUES (?, ?, 'seed', 'seed_task', ?, 10, 'pending')`,
            [job.job_id, job.host_id, job.profile_url]
          );
        }

        await conn.execute(
          `INSERT INTO social_runs (social_job_id, source_id, job_id, status, started_at)
           VALUES (?, ?, ?, 'queued', NOW())`,
          [job.id, job.source_id, job.job_id]
        );
        await conn.execute(
          `UPDATE social_jobs SET status = 'queued', last_run_at = NOW(), updated_at = NOW()
           WHERE id = ? AND status = 'scheduled'`,
          [job.id]
        );
        await conn.execute(
          `UPDATE jobs SET status = 'queued', started_at = NULL, finished_at = NULL, updated_at = NOW()
           WHERE id = ? AND status = 'scheduled'`,
          [job.job_id]
        );
      }

      await conn.execute(
        `UPDATE jobs SET status = 'queued', started_at = NULL, finished_at = NULL, updated_at = NOW()
         WHERE status = 'scheduled'
           AND scheduled_at IS NOT NULL
           AND scheduled_at <= NOW()
           AND id NOT IN (SELECT job_id FROM social_jobs)`
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      console.error('[Scheduler] 到期任务入队失败:', err.message);
    } finally {
      conn.release();
    }
  }

  async recoverTimedOutTasks() {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [tasks] = await conn.execute(
        `SELECT pt.id, pt.job_id, pt.retry_count, pt.started_at,
                j.page_timeout_seconds, j.auto_scroll_seconds, j.max_retry_count
         FROM page_tasks pt
         JOIN jobs j ON j.id = pt.job_id
         WHERE pt.status = 'running'`
      );

      const affectedJobIds = new Set();
      const now = Date.now();
      for (const task of tasks) {
        const startedAt = new Date(task.started_at).getTime();
        if (!Number.isFinite(startedAt)) continue;

        const timeoutSeconds = Math.max(
          toInt(task.page_timeout_seconds, 60) + toInt(task.auto_scroll_seconds, 0) + 60,
          120
        );
        if (now - startedAt <= timeoutSeconds * 1000) continue;

        const retryCount = toInt(task.retry_count, 0);
        const maxRetryCount = toInt(task.max_retry_count, 3);
        if (retryCount < maxRetryCount) {
          await conn.execute(
            `UPDATE page_tasks
             SET status = 'retry_waiting',
                 retry_count = retry_count + 1,
                 lease_token = NULL,
                 lease_expires_at = NULL,
                 error_message = 'Recovered timed out running task',
                 updated_at = NOW()
             WHERE id = ? AND status = 'running'`,
            [task.id]
          );
        } else {
          await conn.execute(
            `UPDATE page_tasks
             SET status = 'failed',
                 finished_at = NOW(),
                 lease_token = NULL,
                 lease_expires_at = NULL,
                 error_message = 'Recovered timed out running task',
                 updated_at = NOW()
             WHERE id = ? AND status = 'running'`,
            [task.id]
          );
        }
        affectedJobIds.add(task.job_id);
      }

      for (const jobId of affectedJobIds) {
        await finalizeJobIfDone(conn, jobId);
      }

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      console.error('[Scheduler] 回收超时任务失败:', err.message);
    } finally {
      conn.release();
    }
  }

  async checkHeartbeatTimeouts() {
    try {
      const timeoutSeconds = await getHeartbeatTimeoutSeconds(db);

      await db.execute(
        `UPDATE hosts SET status = 'offline'
         WHERE status = 'online'
           AND (
             last_heartbeat_at IS NULL
             OR last_heartbeat_at < NOW() - INTERVAL '${timeoutSeconds} seconds'
           )`
      );
    } catch (err) {
      console.error('[Scheduler] 检查心跳超时失败:', err.message);
    }
  }

  async updateJobStatuses() {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [jobs] = await conn.execute(`SELECT id FROM jobs WHERE status IN ('queued','running')`);
      for (const job of jobs) {
        await finalizeJobIfDone(conn, job.id);
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      console.error('[Scheduler] 更新任务状态失败:', err.message);
    } finally {
      conn.release();
    }
  }

  async syncHostCounts() {
    try {
      await db.execute(
        `UPDATE hosts h SET
          pending_count = (SELECT COUNT(*) FROM page_tasks pt WHERE pt.assigned_host_id = h.id AND pt.status IN ('pending','retry_waiting')),
          running_count = (SELECT COUNT(*) FROM page_tasks pt WHERE pt.assigned_host_id = h.id AND pt.status = 'running')`
      );
    } catch (err) {
      console.error('[Scheduler] 同步主机计数失败:', err.message);
    }
  }
}

module.exports = new Scheduler();
