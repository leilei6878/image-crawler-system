const db = require('../db');

async function getHeartbeatTimeoutSeconds(dbConn) {
  const [settings] = await dbConn.execute(
    `SELECT setting_value FROM system_settings WHERE setting_key = 'heartbeat_timeout_seconds'`
  );
  return settings.length > 0 ? parseInt(settings[0].setting_value, 10) : 90;
}

class LoadBalancer {
  async findBestHost(conn, siteType, requiredTags = []) {
    const dbConn = conn || db;

    const [settings] = await dbConn.execute(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'global_max_pending_threshold'`
    );
    const maxPendingThreshold = settings.length > 0 ? parseInt(settings[0].setting_value) : 100;
    const heartbeatTimeoutSeconds = await getHeartbeatTimeoutSeconds(dbConn);

    const [candidates] = await dbConn.execute(
      `SELECT h.*,
        (SELECT COUNT(*) FROM page_tasks pt WHERE pt.assigned_host_id = h.id AND pt.status IN ('pending','retry_waiting')) as real_pending,
        (SELECT COUNT(*) FROM page_tasks pt WHERE pt.assigned_host_id = h.id AND pt.status = 'running') as real_running
       FROM hosts h
       WHERE h.status = 'online'
         AND h.last_heartbeat_at IS NOT NULL
         AND h.last_heartbeat_at >= NOW() - INTERVAL '${heartbeatTimeoutSeconds} seconds'
         AND h.accept_global_expand = true`
    );

    if (candidates.length === 0) return null;

    const scored = candidates
      .filter(host => {
        if (host.real_pending >= maxPendingThreshold) return false;
        let sites = host.supported_sites;
        if (typeof sites === 'string') sites = JSON.parse(sites);
        if (sites && sites.length > 0 && !sites.includes(siteType)) return false;
        if (host.real_pending + host.real_running >= host.max_concurrency * 3) return false;
        if (requiredTags.length > 0) {
          let tags = host.host_tags;
          if (typeof tags === 'string') tags = JSON.parse(tags);
          if (!tags || !requiredTags.some(t => tags.includes(t))) return false;
        }
        return true;
      })
      .map(host => {
        const pendingRate = host.max_concurrency > 0 ? host.real_pending / host.max_concurrency : host.real_pending;
        const runningRate = host.max_concurrency > 0 ? host.real_running / host.max_concurrency : host.real_running;
        const availableSlots = Math.max(0, host.max_concurrency - host.real_running);
        const score = pendingRate * 0.5 + runningRate * 0.3 - (availableSlots / Math.max(host.max_concurrency, 1)) * 0.2;
        return { ...host, pending_count: host.real_pending, running_count: host.real_running, available_slots: availableSlots, score };
      })
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score;
        if (a.available_slots !== b.available_slots) return b.available_slots - a.available_slots;
        return new Date(b.last_heartbeat_at) - new Date(a.last_heartbeat_at);
      });

    return scored.length > 0 ? scored[0] : null;
  }

  async getHostLoads() {
    const heartbeatTimeoutSeconds = await getHeartbeatTimeoutSeconds(db);
    const [hosts] = await db.execute(
      `SELECT h.id, h.name,
        CASE
          WHEN h.status = 'disabled' THEN 'disabled'
          WHEN h.last_heartbeat_at IS NULL THEN 'offline'
          WHEN h.last_heartbeat_at < NOW() - INTERVAL '${heartbeatTimeoutSeconds} seconds' THEN 'offline'
          ELSE h.status
        END as status,
        h.max_concurrency, h.accept_global_expand,
        h.host_tags, h.supported_sites, h.last_heartbeat_at,
        (SELECT COUNT(*) FROM page_tasks pt WHERE pt.assigned_host_id = h.id AND pt.status IN ('pending','retry_waiting')) as pending_count,
        (SELECT COUNT(*) FROM page_tasks pt WHERE pt.assigned_host_id = h.id AND pt.status = 'running') as running_count
       FROM hosts h
       WHERE h.status != 'deleted'
       ORDER BY h.name`
    );

    return hosts.map(h => ({
      ...h,
      available_slots: Math.max(0, h.max_concurrency - h.running_count),
      load_rate: h.max_concurrency > 0
        ? ((h.pending_count + h.running_count) / h.max_concurrency * 100).toFixed(1) : 0,
    }));
  }
}

module.exports = new LoadBalancer();
