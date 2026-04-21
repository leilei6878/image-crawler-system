const express = require('express');
const router = express.Router();
const db = require('../db');
const logger = require('../services/logger');

async function getHeartbeatTimeoutSeconds(dbConn) {
  const [settings] = await dbConn.execute(
    `SELECT setting_value FROM system_settings WHERE setting_key = 'heartbeat_timeout_seconds'`
  );
  return settings.length > 0 ? parseInt(settings[0].setting_value, 10) : 90;
}

function resolveHostStatus(host, timeoutSeconds) {
  if (host.status === 'deleted') return 'deleted';
  if (host.status === 'disabled') return 'disabled';
  if (!host.last_heartbeat_at) return 'offline';

  const heartbeatAt = new Date(host.last_heartbeat_at).getTime();
  if (!Number.isFinite(heartbeatAt)) return 'offline';

  const staleMs = Math.max(timeoutSeconds, 30) * 1000;
  return Date.now() - heartbeatAt > staleMs ? 'offline' : 'online';
}

router.get('/', async (req, res) => {
  try {
    const timeoutSeconds = await getHeartbeatTimeoutSeconds(db);
    const [rows] = await db.execute(
      `SELECT h.*,
        (SELECT COUNT(*) FROM page_tasks pt WHERE pt.assigned_host_id = h.id AND pt.status IN ('pending','retry_waiting')) as real_pending,
        (SELECT COUNT(*) FROM page_tasks pt WHERE pt.assigned_host_id = h.id AND pt.status = 'running') as real_running
       FROM hosts h
       WHERE h.status != 'deleted'
       ORDER BY h.created_at ASC`
    );
    const data = rows.map(h => ({
      ...h,
      status: resolveHostStatus(h, timeoutSeconds),
      pending_count: parseInt(h.real_pending) || 0,
      running_count: parseInt(h.real_running) || 0,
      available_slots: Math.max(0, h.max_concurrency - (parseInt(h.real_running) || 0)),
    }));
    res.json({ data });
  } catch (err) {
    console.error('[Hosts] 获取列表失败:', err);
    res.status(500).json({ error: '获取主机列表失败' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM hosts WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: '主机不存在' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: '获取主机详情失败' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, host_key, max_concurrency = 5, accept_global_expand = true,
            host_tags = [], supported_sites = [], remark = '' } = req.body;
    if (!name || !host_key) return res.status(400).json({ error: '主机名称和密钥不能为空' });

    const [existing] = await db.execute('SELECT id FROM hosts WHERE host_key = ?', [host_key]);
    if (existing.length > 0) return res.status(400).json({ error: '主机密钥已存在' });

    const [rows] = await db.execute(
      `INSERT INTO hosts (name, host_key, max_concurrency, accept_global_expand, host_tags, supported_sites, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [name, host_key, max_concurrency, accept_global_expand,
       JSON.stringify(host_tags), JSON.stringify(supported_sites), remark]
    );

    await logger.info('host_create', `创建主机: ${name}`, { hostId: rows[0].id });
    res.status(201).json({ id: rows[0].id, message: '主机创建成功' });
  } catch (err) {
    console.error('[Hosts] 创建失败:', err);
    res.status(500).json({ error: '创建主机失败' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, max_concurrency, accept_global_expand, host_tags, supported_sites, remark, status } = req.body;

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (max_concurrency !== undefined) { updates.push('max_concurrency = ?'); params.push(max_concurrency); }
    if (accept_global_expand !== undefined) { updates.push('accept_global_expand = ?'); params.push(accept_global_expand); }
    if (host_tags !== undefined) { updates.push('host_tags = ?'); params.push(JSON.stringify(host_tags)); }
    if (supported_sites !== undefined) { updates.push('supported_sites = ?'); params.push(JSON.stringify(supported_sites)); }
    if (remark !== undefined) { updates.push('remark = ?'); params.push(remark); }
    if (status !== undefined) { updates.push('status = ?'); params.push(status); }
    updates.push('updated_at = NOW()');

    if (updates.length === 1) return res.status(400).json({ error: '没有要更新的字段' });

    params.push(id);
    await db.execute(`UPDATE hosts SET ${updates.join(', ')} WHERE id = ?`, params);
    await logger.info('host_update', `更新主机 #${id}`, { hostId: parseInt(id) });
    res.json({ message: '主机更新成功' });
  } catch (err) {
    res.status(500).json({ error: '更新主机失败' });
  }
});

router.delete('/:id', async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;

    const [hosts] = await conn.execute('SELECT id, name, host_key FROM hosts WHERE id = ?', [id]);
    if (hosts.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: '主机不存在' });
    }

    const [activeTasks] = await conn.execute(
      `SELECT COUNT(*) as cnt
       FROM page_tasks
       WHERE assigned_host_id = ?
         AND status IN ('pending', 'retry_waiting', 'running', 'assigned')`,
      [id]
    );
    if (parseInt(activeTasks[0].cnt, 10) > 0) {
      await conn.rollback();
      return res.status(400).json({ error: '该主机仍有未完成任务，不能删除' });
    }

    await conn.execute('DELETE FROM host_heartbeats WHERE host_id = ?', [id]);
    await conn.execute('DELETE FROM hosts WHERE id = ?', [id]);
    await conn.commit();

    await logger.info('host_delete', `删除主机 #${id}`, {
      hostId: parseInt(id, 10),
      hostKey: hosts[0].host_key,
      hostName: hosts[0].name,
    });
    res.json({ message: '主机已删除' });
  } catch (err) {
    await conn.rollback();
    console.error('[Hosts] 删除主机失败:', err);
    res.status(500).json({ error: '删除主机失败', message: err.message });
  } finally {
    conn.release();
  }
});

// Worker heartbeat
router.post('/heartbeat', async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { host_key, host_name, max_concurrency, supported_sites = [], tags = [],
            running_count = 0, cpu_usage, memory_usage, ip_address } = req.body;

    if (!host_key) return res.status(400).json({ error: '缺少host_key' });

    const [hosts] = await conn.execute('SELECT * FROM hosts WHERE host_key = ?', [host_key]);

    if (hosts.length === 0) {
      // 自动注册
      const [rows] = await conn.execute(
        `INSERT INTO hosts (name, host_key, status, max_concurrency, accept_global_expand, host_tags, supported_sites)
         VALUES (?, ?, 'online', ?, true, ?, ?) RETURNING id`,
        [host_name || host_key, host_key, max_concurrency || 5,
         JSON.stringify(tags), JSON.stringify(supported_sites)]
      );
      const hostId = rows[0].id;
      await conn.execute(
        `INSERT INTO host_heartbeats (host_id, cpu_usage, memory_usage, running_count, ip_address)
         VALUES (?, ?, ?, ?, ?)`,
        [hostId, cpu_usage || null, memory_usage || null, running_count, ip_address || null]
      );
      res.json({ host_id: hostId, message: '主机注册成功', registered: true });
    } else {
      const host = hosts[0];
      if (host.status === 'disabled') {
        return res.json({ host_id: host.id, message: '主机已禁用', disabled: true });
      }

      const updateFields = ['status = \'online\'', 'last_heartbeat_at = NOW()', 'updated_at = NOW()'];
      const updateParams = [];

      if (host_name) { updateFields.push('name = ?'); updateParams.push(host_name); }
      if (supported_sites.length > 0) { updateFields.push('supported_sites = ?'); updateParams.push(JSON.stringify(supported_sites)); }
      if (ip_address) { updateFields.push('ip_info = ?'); updateParams.push(ip_address); }

      updateParams.push(host.id);
      await conn.execute(`UPDATE hosts SET ${updateFields.join(', ')} WHERE id = ?`, updateParams);

      await conn.execute(
        `INSERT INTO host_heartbeats (host_id, cpu_usage, memory_usage, running_count, pending_count, ip_address)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [host.id, cpu_usage || null, memory_usage || null, running_count, host.pending_count || 0, ip_address || null]
      );

      if (parseInt(running_count, 10) === 0) {
        const [staleTasks] = await conn.execute(
          `SELECT pt.id, pt.retry_count, IFNULL(j.max_retry_count, 3) as max_retry_count
           FROM page_tasks pt
           JOIN jobs j ON j.id = pt.job_id
           WHERE pt.assigned_host_id = ?
             AND pt.status = 'running'
             AND TIMESTAMPDIFF(
               SECOND,
               pt.started_at,
               NOW()
             ) > GREATEST(IFNULL(j.page_timeout_seconds, 60) + IFNULL(j.auto_scroll_seconds, 30) + 30, 120)`,
          [host.id]
        );

        for (const task of staleTasks) {
          if (parseInt(task.retry_count, 10) < parseInt(task.max_retry_count, 10)) {
            await conn.execute(
              `UPDATE page_tasks
               SET status = 'retry_waiting',
                   retry_count = retry_count + 1,
                   error_message = 'Recovered stale running task on heartbeat',
                   updated_at = NOW()
               WHERE id = ?`,
              [task.id]
            );
          } else {
            await conn.execute(
              `UPDATE page_tasks
               SET status = 'failed',
                   finished_at = NOW(),
                   error_message = 'Recovered stale running task on heartbeat',
                   updated_at = NOW()
               WHERE id = ?`,
              [task.id]
            );
          }
        }
      }

      const [counts] = await conn.execute(
        `SELECT
          SUM(CASE WHEN status IN ('pending','retry_waiting') THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running
         FROM page_tasks WHERE assigned_host_id = ?`,
        [host.id]
      );

      await conn.execute(
        'UPDATE hosts SET pending_count = ?, running_count = ? WHERE id = ?',
        [parseInt(counts[0].pending) || 0, parseInt(counts[0].running) || 0, host.id]
      );

      res.json({
        host_id: host.id,
        message: '心跳更新成功',
        max_concurrency: parseInt(host.max_concurrency, 10) || 1,
        pending_count: parseInt(counts[0].pending) || 0,
        running_count: parseInt(counts[0].running) || 0
      });
    }
  } catch (err) {
    console.error('[Hosts] 心跳处理失败:', err);
    res.status(500).json({ error: '心跳处理失败' });
  } finally {
    conn.release();
  }
});

module.exports = router;
