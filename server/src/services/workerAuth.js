const crypto = require('crypto');

function workerAuthRequired() {
  return String(process.env.REQUIRE_WORKER_AUTH || 'true').toLowerCase() !== 'false';
}

function secretsEqual(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

async function authenticateWorker(conn, { hostId, hostKey }, { lock = false } = {}) {
  const parsedHostId = Number(hostId);
  if (!Number.isInteger(parsedHostId) || parsedHostId <= 0) {
    return { ok: false, status: 401, message: 'invalid worker host_id' };
  }

  const lockClause = lock ? ' FOR UPDATE' : '';
  const [rows] = await conn.execute(
    `SELECT id, host_key, status FROM hosts WHERE id = ?${lockClause}`,
    [parsedHostId]
  );
  if (rows.length === 0) {
    return { ok: false, status: 401, message: 'worker host is not registered' };
  }

  const host = rows[0];
  if (host.status === 'disabled' || host.status === 'deleted') {
    return { ok: false, status: 403, message: 'worker host is disabled' };
  }

  if (workerAuthRequired() && !secretsEqual(hostKey, host.host_key)) {
    return { ok: false, status: 401, message: 'invalid worker credentials' };
  }

  return { ok: true, host };
}

module.exports = {
  authenticateWorker,
  secretsEqual,
  workerAuthRequired,
};
