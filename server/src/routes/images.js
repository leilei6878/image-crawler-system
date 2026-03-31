const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../services/logger');
const loadBalancer = require('../services/loadBalancer');

router.get('/', async (req, res) => {
  try {
    const { job_id, page = 1, limit = 50, status } = req.query;
    const offset = (page - 1) * limit;
    let where = '1=1';
    const params = [];

    if (job_id) { params.push(job_id); where += ` AND i.job_id = ?`; }
    if (status) { params.push(status); where += ` AND i.status = ?`; }

    const [rows] = await db.execute(
      `SELECT i.*, h.name as host_name
       FROM images i LEFT JOIN hosts h ON i.host_id = h.id
       WHERE ${where}
       ORDER BY i.created_at DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`,
      params
    );

    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM images i WHERE ${where}`, params
    );

    res.json({
      data: rows,
      total: parseInt(countResult[0].total),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    console.error('[Images] 获取列表失败:', err);
    res.status(500).json({ error: '获取图片列表失败' });
  }
});

router.post('/:id/expand', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { mode, target_host_id } = req.body;

    if (!['local', 'auto', 'manual'].includes(mode)) {
      await conn.rollback();
      return res.status(400).json({ error: '无效的扩采模式' });
    }

    const [images] = await conn.execute(
      `SELECT i.*, j.site_type, j.host_id as job_host_id, j.status as job_status,
              j.concurrency, j.auto_scroll_seconds, j.page_timeout_seconds
       FROM images i JOIN jobs j ON i.job_id = j.id WHERE i.id = ?`, [id]
    );

    if (images.length === 0) { await conn.rollback(); return res.status(404).json({ error: '图片不存在' }); }
    const image = images[0];

    if (!image.detail_page_url) {
      await conn.rollback();
      return res.status(400).json({ error: '该图片缺少详情页链接，无法扩采' });
    }

    if (image.expand_status !== 'not_expanded') {
      await conn.rollback();
      return res.status(400).json({ error: '该图片已加入扩采队列', expand_status: image.expand_status });
    }

    const [existingTasks] = await conn.execute(
      `SELECT id FROM page_tasks WHERE target_url = ? AND status NOT IN ('cancelled','failed')`,
      [image.detail_page_url]
    );
    if (existingTasks.length > 0) {
      await conn.rollback();
      return res.status(400).json({ error: '该URL已存在采集任务' });
    }

    let assignedHostId;
    let dispatchMode;

    if (mode === 'local') {
      assignedHostId = image.job_host_id;
      dispatchMode = 'local_expand';
      const [host] = await conn.execute('SELECT status FROM hosts WHERE id = ?', [assignedHostId]);
      if (host.length === 0 || host[0].status === 'disabled') {
        await conn.rollback();
        return res.status(400).json({ error: '目标主机不可用' });
      }
      if (host[0].status === 'offline') {
        await conn.rollback();
        return res.status(400).json({ error: '目标主机当前离线' });
      }
    } else if (mode === 'auto') {
      dispatchMode = 'global_auto_expand';
      const bestHost = await loadBalancer.findBestHost(conn, image.site_type);
      if (!bestHost) {
        await conn.rollback();
        return res.status(400).json({ error: '暂无符合条件的可用主机' });
      }
      assignedHostId = bestHost.id;
    } else {
      if (!target_host_id) {
        await conn.rollback();
        return res.status(400).json({ error: '指定主机扩采必须提供target_host_id' });
      }
      dispatchMode = 'manual_assign_expand';
      assignedHostId = target_host_id;
    }

    const [taskRows] = await conn.execute(
      `INSERT INTO page_tasks (job_id, assigned_host_id, parent_task_id, task_type, dispatch_mode,
        source_image_id, target_url, priority, status)
       VALUES (?, ?, ?, 'detail', ?, ?, ?, 5, 'pending') RETURNING id`,
      [image.job_id, assignedHostId, image.page_task_id, dispatchMode, image.id, image.detail_page_url]
    );

    await conn.execute(
      `UPDATE images SET expand_status = 'queued', updated_at = NOW() WHERE id = ?`, [id]
    );

    await conn.execute(
      `UPDATE hosts SET pending_count = pending_count + 1, updated_at = NOW() WHERE id = ?`,
      [assignedHostId]
    );

    await conn.commit();
    await logger.info('image_expand', `图片 #${id} 扩采 (${mode})`, { jobId: image.job_id });
    res.json({ message: '扩采任务已创建', task_id: taskRows[0].id, host_id: assignedHostId });
  } catch (err) {
    await conn.rollback();
    console.error('[Images] 扩采失败:', err);
    res.status(500).json({ error: '扩采失败', message: err.message });
  } finally {
    conn.release();
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute(`UPDATE images SET status = 'deleted', updated_at = NOW() WHERE id = ?`, [id]);
    res.json({ message: '图片已删除' });
  } catch (err) {
    res.status(500).json({ error: '删除失败' });
  }
});

router.post('/:id/favorite', async (req, res) => {
  try {
    const { id } = req.params;
    const [images] = await db.execute('SELECT is_favorite FROM images WHERE id = ?', [id]);
    if (images.length === 0) return res.status(404).json({ error: '图片不存在' });
    const newVal = !images[0].is_favorite;
    await db.execute(`UPDATE images SET is_favorite = ?, updated_at = NOW() WHERE id = ?`, [newVal, id]);
    res.json({ message: newVal ? '已收藏' : '已取消收藏', is_favorite: newVal });
  } catch (err) {
    res.status(500).json({ error: '操作失败' });
  }
});

module.exports = router;
