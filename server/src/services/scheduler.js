const cron = require('node-cron');
const db = require('../db');
const logger = require('./logger');

class Scheduler {
  start() {
    // 每30秒检查一次任务状态
    cron.schedule('*/30 * * * * *', () => this.updateJobStatuses());
    // 每60秒同步主机计数
    cron.schedule('*/60 * * * * *', () => this.syncHostCounts());
    // 每30秒检查超时的心跳
    cron.schedule('*/30 * * * * *', () => this.checkHeartbeatTimeouts());
  }

  async checkHeartbeatTimeouts() {
    try {
      const [settings] = await db.execute(
        `SELECT setting_value FROM system_settings WHERE setting_key = 'heartbeat_timeout_seconds'`
      );
      const timeoutSeconds = settings.length > 0 ? parseInt(settings[0].setting_value) : 90;

      await db.execute(
        `UPDATE hosts SET status = 'offline'
         WHERE status = 'online'
           AND last_heartbeat_at < NOW() - INTERVAL '${timeoutSeconds} seconds'`
      );
    } catch (err) {
      console.error('[Scheduler] 检查心跳超时失败:', err.message);
    }
  }

  async updateJobStatuses() {
    try {
      const [runningJobs] = await db.execute(`SELECT id FROM jobs WHERE status = 'running'`);
      for (const job of runningJobs) {
        const [remaining] = await db.execute(
          `SELECT COUNT(*) as cnt FROM page_tasks
           WHERE job_id = ? AND status IN ('pending','running','retry_waiting','assigned')`,
          [job.id]
        );
        if (parseInt(remaining[0].cnt) === 0) {
          await db.execute(
            `UPDATE jobs SET status = 'completed', finished_at = NOW()
             WHERE id = ? AND status = 'running'`,
            [job.id]
          );
          await logger.info('job_complete', `任务 #${job.id} 已完成`, { jobId: job.id });
          console.log(`[Scheduler] 任务 #${job.id} 已完成`);
        }
      }
    } catch (err) {
      console.error('[Scheduler] 更新任务状态失败:', err.message);
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
