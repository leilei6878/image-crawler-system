const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/overview', async (req, res) => {
  try {
    const [jobStats] = await db.execute(
      `SELECT
        COUNT(*) as total_jobs,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running_jobs,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_jobs,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_jobs,
        SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) as queued_jobs,
        SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END) as paused_jobs
       FROM jobs WHERE status != 'deleted'`
    );

    const [hostStats] = await db.execute(
      `SELECT
        COUNT(*) as total_hosts,
        SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online_hosts,
        SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline_hosts,
        SUM(running_count) as total_running,
        SUM(pending_count) as total_pending
       FROM hosts WHERE status != 'disabled'`
    );

    const [imageStats] = await db.execute(
      `SELECT COUNT(*) as total_images FROM images WHERE status != 'deleted'`
    );

    const [taskStats] = await db.execute(
      `SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_tasks,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running_tasks,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_tasks,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_tasks
       FROM page_tasks`
    );

    res.json({
      jobs: jobStats[0],
      hosts: hostStats[0],
      images: imageStats[0],
      tasks: taskStats[0]
    });
  } catch (err) {
    console.error('[Stats] 获取统计失败:', err);
    res.status(500).json({ error: '获取统计失败' });
  }
});

router.get('/logs', async (req, res) => {
  try {
    const { job_id, level, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    let where = '1=1';
    const params = [];

    if (job_id) { params.push(job_id); where += ` AND job_id = ?`; }
    if (level) { params.push(level); where += ` AND level = ?`; }

    const [rows] = await db.execute(
      `SELECT * FROM job_logs WHERE ${where}
       ORDER BY created_at DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
      params
    );

    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: '获取日志失败' });
  }
});

module.exports = router;
