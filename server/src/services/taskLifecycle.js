// PostgreSQL is the verified delivery backend. Keep lifecycle writers in one
// transaction-scoped critical section so cancellation, claims and reports cannot
// cross. Lock is released automatically on commit, rollback or connection loss.
async function lockTaskLifecycle(conn) {
  await conn.execute('SELECT pg_advisory_xact_lock(6878, 7)');
}

function leaseDurationSeconds(task) {
  const integer = (value, fallback) => {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  return Math.max(integer(task.page_timeout_seconds, 60)
    + integer(task.auto_scroll_seconds, 0) + 90, 180);
}

module.exports = { lockTaskLifecycle, leaseDurationSeconds };
