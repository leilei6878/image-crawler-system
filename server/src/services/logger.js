const db = require('../db');

async function log(level, action, message, { jobId = null, pageTaskId = null, hostId = null, details = null } = {}) {
  try {
    await db.execute(
      `INSERT INTO job_logs (job_id, page_task_id, host_id, level, action, message, details)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [jobId, pageTaskId, hostId, level, action, message, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('[Logger] 写入日志失败:', err.message);
  }
}

module.exports = {
  info: (action, message, opts) => log('info', action, message, opts),
  warn: (action, message, opts) => log('warn', action, message, opts),
  error: (action, message, opts) => log('error', action, message, opts),
  debug: (action, message, opts) => log('debug', action, message, opts),
};
