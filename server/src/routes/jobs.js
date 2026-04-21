const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../services/logger');

// 创建任务
router.post('/', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const {
      name, site_type, host_id, initial_urls, concurrency = 3,
      auto_scroll_seconds = 30, auto_scroll_max_rounds = 10,
      page_timeout_seconds = 60, max_retry_count = 3, max_images,
      start_mode = 'immediate', scheduled_at, filters
    } = req.body;

    const [hosts] = await conn.execute('SELECT id, status FROM hosts WHERE id = ?', [host_id]);
    if (hosts.length === 0) {
      await conn.rollback();
      return res.status(400).json({ error: '指定主机不存在' });
    }

    const status = start_mode === 'scheduled' ? 'scheduled' : 'queued';
    const [jobRows] = await conn.execute(
      `INSERT INTO jobs (name, site_type, host_id, status, initial_urls, concurrency,
        auto_scroll_seconds, auto_scroll_max_rounds, page_timeout_seconds,
        max_retry_count, max_images, start_mode, scheduled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [name, site_type, host_id, status, JSON.stringify(initial_urls),
       concurrency, auto_scroll_seconds, auto_scroll_max_rounds || 10,
       page_timeout_seconds, max_retry_count, max_images || null, start_mode,
       scheduled_at || null]
    );
    const jobId = jobRows[0].id;

    if (filters) {
      await conn.execute(
        `INSERT INTO job_filters (job_id, logic_mode, min_like, min_favorite, min_comment,
          min_share, min_width, min_height, ratio_min, ratio_max,
          exclude_video, exclude_collage, only_detail_accessible)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [jobId, filters.logic_mode || 'and', filters.min_like || null,
         filters.min_favorite || null, filters.min_comment || null,
         filters.min_share || null, filters.min_width || null,
         filters.min_height || null, filters.ratio_min || null,
         filters.ratio_max || null, filters.exclude_video ? true : false,
         filters.exclude_collage ? true : false, filters.only_detail_accessible ? true : false]
      );
    }

    const urls = Array.isArray(initial_urls) ? initial_urls : [initial_urls];
    for (const url of urls) {
      await conn.execute(
        `INSERT INTO page_tasks (job_id, assigned_host_id, task_type, dispatch_mode, target_url, priority, status)
         VALUES (?, ?, 'seed', 'seed_task', ?, 10, 'pending')`,
        [jobId, host_id, url]
      );
    }

    await conn.execute(
      `UPDATE hosts SET pending_count = (
        SELECT COUNT(*) FROM page_tasks WHERE assigned_host_id = ? AND status IN ('pending','retry_waiting')
      ) WHERE id = ?`,
      [host_id, host_id]
    );

    await conn.commit();
    await logger.info('job_create', `创建任务: ${name}`, { jobId, hostId: host_id });
    res.status(201).json({ id: jobId, message: '任务创建成功' });
  } catch (err) {
    await conn.rollback();
    console.error('[Jobs] 创建任务失败:', err);
    res.status(500).json({ error: '创建任务失败', message: err.message });
  } finally {
    conn.release();
  }
});

// 获取任务列表
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let where = "WHERE j.status != 'deleted'";
    const params = [];

    if (status) {
      params.push(status);
      where += ` AND j.status = ?`;
    }

    const [rows] = await db.execute(
      `SELECT j.*, h.name as host_name, h.status as host_status,
        (SELECT COUNT(*) FROM page_tasks pt WHERE pt.job_id = j.id AND pt.status = 'pending') as pending_tasks,
        (SELECT COUNT(*) FROM page_tasks pt WHERE pt.job_id = j.id AND pt.status = 'running') as running_tasks,
        (SELECT COUNT(*) FROM page_tasks pt WHERE pt.job_id = j.id AND pt.status = 'success') as success_tasks,
        (SELECT COUNT(*) FROM page_tasks pt WHERE pt.job_id = j.id AND pt.status = 'failed') as failed_tasks,
        (SELECT COUNT(*) FROM images img WHERE img.job_id = j.id) as image_count
       FROM jobs j LEFT JOIN hosts h ON j.host_id = h.id
       ${where}
       ORDER BY j.created_at DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
      params
    );

    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM jobs j ${where}`, params
    );

    res.json({
      data: rows,
      total: parseInt(countResult[0].total),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    console.error('[Jobs] 获取列表失败:', err);
    res.status(500).json({ error: '获取任务列表失败' });
  }
});

// 获取任务详情
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      img_page = 1,
      img_limit = 50,
      img_sort_by = 'created_at',
      img_sort_order = 'desc',
      img_min_like,
      img_min_favorite,
      img_min_comment,
      img_min_share,
      img_expand_status,
    } = req.query;
    const imgOffset = (img_page - 1) * img_limit;

    const [jobs] = await db.execute(
      `SELECT j.*, h.name as host_name FROM jobs j
       LEFT JOIN hosts h ON j.host_id = h.id WHERE j.id = ?`, [id]
    );
    if (jobs.length === 0) return res.status(404).json({ error: '任务不存在' });

    const [filters] = await db.execute('SELECT * FROM job_filters WHERE job_id = ?', [id]);

    const sortableFields = new Set([
      'created_at',
      'like_count',
      'favorite_count',
      'comment_count',
      'share_count',
      'width',
      'height',
    ]);
    const sortField = sortableFields.has(img_sort_by) ? img_sort_by : 'created_at';
    const sortOrder = String(img_sort_order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    const sortExpr = sortField === 'created_at' ? 'created_at' : `COALESCE(${sortField}, 0)`;

    const imageWhere = ['job_id = ?'];
    const imageParams = [id];

    const appendMinFilter = (value, column) => {
      if (value !== undefined && value !== null && value !== '') {
        imageWhere.push(`COALESCE(${column}, 0) >= ?`);
        imageParams.push(parseInt(value, 10) || 0);
      }
    };

    appendMinFilter(img_min_like, 'like_count');
    appendMinFilter(img_min_favorite, 'favorite_count');
    appendMinFilter(img_min_comment, 'comment_count');
    appendMinFilter(img_min_share, 'share_count');

    if (img_expand_status) {
      imageWhere.push('expand_status = ?');
      imageParams.push(img_expand_status);
    }

    const imageWhereSql = imageWhere.join(' AND ');

    const [images] = await db.execute(
      `SELECT * FROM images
       WHERE ${imageWhereSql}
       ORDER BY ${sortExpr} ${sortOrder}, id DESC
       LIMIT ${parseInt(img_limit)} OFFSET ${parseInt(imgOffset)}`,
      imageParams
    );
    const [imgCount] = await db.execute(
      `SELECT COUNT(*) as total FROM images WHERE ${imageWhereSql}`,
      imageParams
    );

    const [pageTasks] = await db.execute(
      `SELECT pt.*, h.name as host_name FROM page_tasks pt
       LEFT JOIN hosts h ON pt.assigned_host_id = h.id
       WHERE pt.job_id = ? ORDER BY pt.created_at DESC LIMIT 100`,
      [id]
    );

    const [taskStats] = await db.execute(
      `SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
       FROM page_tasks WHERE job_id = ?`, [id]
    );

    res.json({
      job: jobs[0],
      filters: filters[0] || null,
      images,
      img_total: parseInt(imgCount[0].total),
      image_query: {
        sort_by: sortField,
        sort_order: sortOrder.toLowerCase(),
        min_like: img_min_like ?? '',
        min_favorite: img_min_favorite ?? '',
        min_comment: img_min_comment ?? '',
        min_share: img_min_share ?? '',
        expand_status: img_expand_status ?? '',
      },
      page_tasks: pageTasks,
      task_stats: taskStats[0]
    });
  } catch (err) {
    console.error('[Jobs] 获取详情失败:', err);
    res.status(500).json({ error: '获取任务详情失败' });
  }
});

// 暂停任务
router.post('/:id/pause', async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute(`UPDATE jobs SET status = 'paused', updated_at = NOW() WHERE id = ? AND status IN ('queued','running')`, [id]);
    await logger.info('job_pause', `暂停任务 #${id}`, { jobId: parseInt(id) });
    res.json({ message: '任务已暂停' });
  } catch (err) {
    res.status(500).json({ error: '暂停失败' });
  }
});

// 恢复任务
router.post('/:id/resume', async (req, res) => {
  try {
    const { id } = req.params;
    const [tasks] = await db.execute(`SELECT COUNT(*) as cnt FROM page_tasks WHERE job_id = ? AND status = 'running'`, [id]);
    const newStatus = parseInt(tasks[0].cnt) > 0 ? 'running' : 'queued';
    await db.execute(`UPDATE jobs SET status = ?, updated_at = NOW() WHERE id = ? AND status = 'paused'`, [newStatus, id]);
    await logger.info('job_resume', `恢复任务 #${id}`, { jobId: parseInt(id) });
    res.json({ message: '任务已恢复' });
  } catch (err) {
    res.status(500).json({ error: '恢复失败' });
  }
});

// 取消任务
router.post('/:id/cancel', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const [jobs] = await conn.execute('SELECT status, host_id FROM jobs WHERE id = ?', [id]);
    if (jobs.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: '任务不存在' });
    }

    await conn.execute(`UPDATE jobs SET status = 'cancelled', updated_at = NOW() WHERE id = ?`, [id]);
    await conn.execute(
      `UPDATE page_tasks SET status = 'cancelled', updated_at = NOW()
       WHERE job_id = ? AND status IN ('pending','retry_waiting','assigned')`, [id]
    );

    await conn.execute(
      `UPDATE hosts SET pending_count = (
        SELECT COUNT(*) FROM page_tasks WHERE assigned_host_id = ? AND status IN ('pending','retry_waiting')
      ) WHERE id = ?`,
      [jobs[0].host_id, jobs[0].host_id]
    );

    await conn.commit();
    await logger.info('job_cancel', `取消任务 #${id}`, { jobId: parseInt(id) });
    res.json({ message: '任务已取消' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: '取消失败' });
  } finally {
    conn.release();
  }
});

// 删除任务(逻辑删除)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute(`UPDATE jobs SET status = 'deleted', updated_at = NOW() WHERE id = ?`, [id]);
    await logger.info('job_delete', `删除任务 #${id}`, { jobId: parseInt(id) });
    res.json({ message: '任务已删除' });
  } catch (err) {
    res.status(500).json({ error: '删除失败' });
  }
});

module.exports = router;
