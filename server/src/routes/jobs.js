const express = require('express');
const router = express.Router();
const archiver = require('archiver');
const db = require('../db');
const logger = require('../services/logger');

function buildImageQuery(req, jobId) {
  const {
    img_sort_by = 'created_at',
    img_sort_order = 'desc',
    img_min_like,
    img_min_favorite,
    img_min_comment,
    img_min_share,
    img_expand_status,
  } = req.query;

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
  const imageParams = [jobId];

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

  return {
    sortExpr,
    sortOrder,
    imageWhereSql: imageWhere.join(' AND '),
    imageParams,
    imageQuery: {
      sort_by: sortField,
      sort_order: sortOrder.toLowerCase(),
      min_like: img_min_like ?? '',
      min_favorite: img_min_favorite ?? '',
      min_comment: img_min_comment ?? '',
      min_share: img_min_share ?? '',
      expand_status: img_expand_status ?? '',
    },
  };
}

function sanitizeFileName(value) {
  return String(value || 'image')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

function toAsciiFileName(value, fallback = 'images') {
  const ascii = sanitizeFileName(value)
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return ascii || fallback;
}

function resolveImageExtension(url, fallback = '.jpg') {
  try {
    const pathname = new URL(url).pathname || '';
    const match = pathname.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i);
    return match ? `.${match[1].toLowerCase()}` : fallback;
  } catch {
    return fallback;
  }
}

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

router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    let where = "WHERE j.status != 'deleted'";
    const params = [];

    if (status) {
      params.push(status);
      where += ' AND j.status = ?';
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
       ORDER BY j.created_at DESC LIMIT ${parseInt(limit, 10)} OFFSET ${parseInt(offset, 10)}`,
      params
    );

    const [countResult] = await db.execute(
      `SELECT COUNT(*) as total FROM jobs j ${where}`, params
    );

    res.json({
      data: rows,
      total: parseInt(countResult[0].total, 10),
      page: parseInt(page, 10),
      limit: parseInt(limit, 10)
    });
  } catch (err) {
    console.error('[Jobs] 获取列表失败:', err);
    res.status(500).json({ error: '获取任务列表失败' });
  }
});

router.get('/:id/download-images', async (req, res) => {
  try {
    const { id } = req.params;
    const scope = req.query.scope === 'all' ? 'all' : 'filtered';

    const [jobs] = await db.execute(
      'SELECT id, name FROM jobs WHERE id = ?',
      [id]
    );
    if (jobs.length === 0) {
      return res.status(404).json({ error: '任务不存在' });
    }

    const query = buildImageQuery(req, id);
    const whereSql = scope === 'all' ? 'job_id = ?' : query.imageWhereSql;
    const params = scope === 'all' ? [id] : query.imageParams;

    const [images] = await db.execute(
      `SELECT id, image_url, author_name, width, height, like_count, favorite_count, comment_count, share_count, expand_status, detail_page_url
       FROM images
       WHERE ${whereSql}
       ORDER BY ${query.sortExpr} ${query.sortOrder}, id DESC`,
      params
    );

    if (images.length === 0) {
      return res.status(400).json({ error: '当前条件下没有可下载的图片' });
    }

    const rawName = `${sanitizeFileName(jobs[0].name || `job_${id}`)}_${scope}.zip`;
    const asciiName = toAsciiFileName(rawName, `job_${id}_${scope}.zip`);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`
    );

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', err => {
      throw err;
    });
    archive.pipe(res);

    const manifest = [];

    for (let index = 0; index < images.length; index++) {
      const image = images[index];
      const record = {
        id: image.id,
        image_url: image.image_url,
        author_name: image.author_name,
        width: image.width,
        height: image.height,
        like_count: image.like_count,
        favorite_count: image.favorite_count,
        comment_count: image.comment_count,
        share_count: image.share_count,
        expand_status: image.expand_status,
        detail_page_url: image.detail_page_url,
        download_status: 'skipped',
      };

      if (!image.image_url) {
        record.reason = 'missing image_url';
        manifest.push(record);
        continue;
      }

      try {
        const response = await fetch(image.image_url);
        if (!response.ok) {
          record.reason = `http_${response.status}`;
          manifest.push(record);
          continue;
        }

        const arrayBuffer = await response.arrayBuffer();
        const ext = resolveImageExtension(image.image_url);
        const baseName = sanitizeFileName(
          image.author_name || `image_${String(index + 1).padStart(3, '0')}_${image.id}`
        );
        const fileName = `${String(index + 1).padStart(3, '0')}_${baseName}_${image.id}${ext}`;

        archive.append(Buffer.from(arrayBuffer), { name: fileName });
        record.download_status = 'ok';
        record.file_name = fileName;
        manifest.push(record);
      } catch (err) {
        record.reason = err.message;
        manifest.push(record);
      }
    }

    archive.append(JSON.stringify({
      job_id: parseInt(id, 10),
      job_name: jobs[0].name,
      scope,
      image_count: images.length,
      query: scope === 'all' ? { scope: 'all' } : query.imageQuery,
      generated_at: new Date().toISOString(),
      images: manifest,
    }, null, 2), { name: 'manifest.json' });

    await archive.finalize();
  } catch (err) {
    console.error('[Jobs] 下载图片失败:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: '下载图片失败', message: err.message });
    } else {
      res.end();
    }
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { img_page = 1, img_limit = 50 } = req.query;
    const imgOffset = (img_page - 1) * img_limit;

    const [jobs] = await db.execute(
      `SELECT j.*, h.name as host_name FROM jobs j
       LEFT JOIN hosts h ON j.host_id = h.id WHERE j.id = ?`, [id]
    );
    if (jobs.length === 0) return res.status(404).json({ error: '任务不存在' });

    const [filters] = await db.execute('SELECT * FROM job_filters WHERE job_id = ?', [id]);
    const query = buildImageQuery(req, id);

    const [images] = await db.execute(
      `SELECT * FROM images
       WHERE ${query.imageWhereSql}
       ORDER BY ${query.sortExpr} ${query.sortOrder}, id DESC
       LIMIT ${parseInt(img_limit, 10)} OFFSET ${parseInt(imgOffset, 10)}`,
      query.imageParams
    );
    const [imgCount] = await db.execute(
      `SELECT COUNT(*) as total FROM images WHERE ${query.imageWhereSql}`,
      query.imageParams
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
      img_total: parseInt(imgCount[0].total, 10),
      image_query: query.imageQuery,
      page_tasks: pageTasks,
      task_stats: taskStats[0]
    });
  } catch (err) {
    console.error('[Jobs] 获取详情失败:', err);
    res.status(500).json({ error: '获取任务详情失败' });
  }
});

router.post('/:id/pause', async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute(`UPDATE jobs SET status = 'paused', updated_at = NOW() WHERE id = ? AND status IN ('queued','running')`, [id]);
    await logger.info('job_pause', `暂停任务 #${id}`, { jobId: parseInt(id, 10) });
    res.json({ message: '任务已暂停' });
  } catch (err) {
    res.status(500).json({ error: '暂停失败' });
  }
});

router.post('/:id/resume', async (req, res) => {
  try {
    const { id } = req.params;
    const [tasks] = await db.execute(`SELECT COUNT(*) as cnt FROM page_tasks WHERE job_id = ? AND status = 'running'`, [id]);
    const newStatus = parseInt(tasks[0].cnt, 10) > 0 ? 'running' : 'queued';
    await db.execute(`UPDATE jobs SET status = ?, updated_at = NOW() WHERE id = ? AND status = 'paused'`, [newStatus, id]);
    await logger.info('job_resume', `恢复任务 #${id}`, { jobId: parseInt(id, 10) });
    res.json({ message: '任务已恢复' });
  } catch (err) {
    res.status(500).json({ error: '恢复失败' });
  }
});

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
    await logger.info('job_cancel', `取消任务 #${id}`, { jobId: parseInt(id, 10) });
    res.json({ message: '任务已取消' });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: '取消失败' });
  } finally {
    conn.release();
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute(`UPDATE jobs SET status = 'deleted', updated_at = NOW() WHERE id = ?`, [id]);
    await logger.info('job_delete', `删除任务 #${id}`, { jobId: parseInt(id, 10) });
    res.json({ message: '任务已删除' });
  } catch (err) {
    res.status(500).json({ error: '删除失败' });
  }
});

module.exports = router;
