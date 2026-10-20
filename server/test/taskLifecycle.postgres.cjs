// Real PostgreSQL + real route handlers over HTTP. No crawler Worker processes.
// Creates and drops an isolated database; requires CREATEDB on the test account.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { migrate } = require('../scripts/migrate');
const express = require('express');

async function main() {
  assert.ok(process.env.TEST_DATABASE_URL, 'Set TEST_DATABASE_URL to a local PostgreSQL test account with CREATEDB');
  const admin = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await admin.connect();
  const database = 'crawler_lease_test_' + crypto.randomBytes(8).toString('hex');
  await admin.query('CREATE DATABASE ' + database);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.pathname = '/' + database;
  process.env.DATABASE_URL = url.href;
  delete process.env.DB_CLIENT;
  process.env.REQUIRE_WORKER_AUTH = 'true';
  let server, db;
  try {
    await migrate({ connectionString: url.href });
    db = require('../src/db');
    const scheduler = require('../src/services/scheduler');
    const app = express(); app.use(express.json());
    app.use('/tasks', require('../src/routes/tasks'));
    app.use('/jobs', require('../src/routes/jobs'));
    app.use('/social', require('../src/routes/social'));
    app.use('/hosts', require('../src/routes/hosts'));
    await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
    const base = 'http://127.0.0.1:' + server.address().port;
    const request = async (route, body) => {
      const res = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { status: res.status, body: await res.json() };
    };
    const [[host]] = await db.execute("INSERT INTO hosts(name,host_key,status,max_concurrency) VALUES ('lease-test','test-key','online',2) RETURNING id");
    const [[other]] = await db.execute("INSERT INTO hosts(name,host_key,status,max_concurrency) VALUES ('other','other-key','online',2) RETURNING id");
    const credentials = { host_id: host.id, host_key: 'test-key' };
    const seed = async (maxRetry = 3, hostIds = [host.id]) => {
      const [[job]] = await db.execute("INSERT INTO jobs(name,site_type,host_id,status,initial_urls,concurrency,page_timeout_seconds,auto_scroll_seconds,max_retry_count) VALUES ('lease-test','generic',?,'queued','[]',1,60,0,?) RETURNING id", [host.id, maxRetry]);
      for (const hostId of hostIds) await db.execute("INSERT INTO page_tasks(job_id,assigned_host_id,task_type,dispatch_mode,target_url,status) VALUES (?,?,'seed','seed_task','https://example.com','pending')", [job.id, hostId]);
      return job.id;
    };
    const pull = (creds = credentials) => request('/tasks/pull', { ...creds, max_tasks: 1 });
    const report = (task, extra = {}) => request('/tasks/report', { ...credentials, page_task_id: task.id, lease_token: task.lease_token, status: 'success', ...extra });
    const read = async id => (await db.execute('SELECT * FROM page_tasks WHERE id = ?', [id]))[0][0];
    const expire = id => db.execute("UPDATE page_tasks SET lease_expires_at = clock_timestamp() - INTERVAL '1 second' WHERE id = ?", [id]);

    const jobId = await seed();
    // Same host, concurrent HTTP claims: only one wins.
    const claims = await Promise.all([pull(), pull()]);
    claims.forEach(r => assert.equal(r.status, 200));
    const claimed = claims.flatMap(r => r.body.tasks);
    assert.equal(claimed.length, 1);
    const task = claimed[0];
    const [[duration]] = await db.execute('SELECT EXTRACT(EPOCH FROM (lease_expires_at - clock_timestamp())) AS seconds FROM page_tasks WHERE id = ?', [task.id]);
    assert.ok(Number(duration.seconds) > 170 && Number(duration.seconds) <= 180);
    await db.execute("UPDATE page_tasks SET started_at = clock_timestamp() - INTERVAL '150 seconds' WHERE id = ?", [task.id]);
    assert.equal((await request('/hosts/heartbeat', { host_key: 'test-key', running_count: 0 })).status, 200);
    assert.equal((await read(task.id)).status, 'running');
    await scheduler.recoverTimedOutTasks();
    assert.equal((await read(task.id)).status, 'running'); // original 120s regression
    assert.equal((await report(task, { images: [{ image_url: 'https://example.com/asset.png' }, { image_url: 'https://example.com/asset.png' }] })).status, 200);
    assert.equal((await db.execute('SELECT id FROM images WHERE page_task_id = ?', [task.id]))[0].length, 1);
    assert.equal((await report(task)).body.duplicate, true);
    assert.equal((await report(task, { lease_token: 'obsolete' })).status, 409);
    assert.equal((await read(task.id)).status, 'success');
    console.log('PASS live lease, concurrent same-host claims, success and duplicates');

    await seed();
    const interrupted = (await pull()).body.tasks[0];
    await expire(interrupted.id);
    assert.equal((await report(interrupted)).status, 409);
    await scheduler.recoverTimedOutTasks();
    assert.equal((await read(interrupted.id)).status, 'retry_waiting');
    assert.equal((await read(interrupted.id)).retry_count, 1);
    assert.equal((await report(interrupted)).status, 409);
    const reclaimed = (await pull()).body.tasks[0];
    assert.equal(reclaimed.id, interrupted.id);
    assert.notEqual(reclaimed.lease_token, interrupted.lease_token);
    assert.equal((await report(interrupted)).status, 409);
    assert.equal((await report(reclaimed)).status, 200);
    console.log('PASS interrupted worker, expiry, recovery, reclaim, stale success fencing');

    await seed(0);
    const noRetry = (await pull()).body.tasks[0];
    assert.equal((await report(noRetry, { status: 'failed' })).status, 200);
    assert.equal((await read(noRetry.id)).status, 'failed');
    assert.equal((await report(noRetry, { status: 'failed' })).body.duplicate, true);
    await seed(0);
    const exhausted = (await pull()).body.tasks[0]; await expire(exhausted.id);
    await scheduler.recoverTimedOutTasks();
    assert.equal((await read(exhausted.id)).status, 'failed');

    const cancelJob = await seed(); const cancelled = (await pull()).body.tasks[0];
    assert.equal((await request('/jobs/' + cancelJob + '/cancel', {})).status, 200);
    assert.equal((await read(cancelled.id)).status, 'cancelled');
    assert.equal((await read(cancelled.id)).lease_token, null);
    assert.equal((await report(cancelled)).status, 200);
    assert.equal((await read(cancelled.id)).status, 'cancelled');
    // Re-run/reset the same task: the old attempt is rejected even before claim.
    await db.execute("UPDATE jobs SET status = 'queued' WHERE id = ?", [cancelJob]);
    await db.execute("UPDATE page_tasks SET status = 'pending' WHERE id = ?", [cancelled.id]);
    assert.equal((await report(cancelled)).status, 409);
    const rerun = (await pull()).body.tasks[0]; assert.equal((await report(rerun)).status, 200);
    console.log('PASS zero retry budget, retry exhaustion, cancellation and reset fencing');

    const socialJobId = await seed();
    const [[source]] = await db.execute("INSERT INTO social_sources(platform,account_name,profile_url) VALUES ('website','lease-test','https://example.com') RETURNING id");
    const [[socialJob]] = await db.execute("INSERT INTO social_jobs(source_id,job_id,status) VALUES (?,?,'queued') RETURNING id", [source.id, socialJobId]);
    const socialTask = (await pull()).body.tasks[0];
    assert.equal((await request('/social/jobs/' + socialJob.id + '/cancel', {})).status, 200);
    assert.equal((await read(socialTask.id)).status, 'cancelled');
    assert.equal((await report(socialTask)).status, 200);
    assert.equal((await request('/social/jobs/' + socialJob.id + '/run', {})).status, 200);
    assert.equal((await report(socialTask)).status, 409);
    const socialReclaimed = (await pull()).body.tasks[0];
    assert.equal(socialReclaimed.id, socialTask.id);
    assert.equal((await report(socialTask)).status, 409);
    assert.equal((await report(socialReclaimed)).status, 200);
    console.log('PASS social cancel, run, reclaim and stale result rejection');

    const crossJob = await seed(3, [host.id, other.id]);
    const crossClaims = await Promise.all([pull(), pull({host_id: other.id, host_key: 'other-key'})]);
    crossClaims.forEach(r => assert.equal(r.status, 200));
    assert.equal(crossClaims.flatMap(r => r.body.tasks).length, 1);
    const [[running]] = await db.execute("SELECT COUNT(*) AS cnt FROM page_tasks WHERE job_id = ? AND status = 'running'", [crossJob]);
    assert.equal(Number(running.cnt), 1);
    console.log('PASS concurrent cross-host job quota');
    assert.equal((await db.execute('SELECT status FROM jobs WHERE id = ?', [jobId]))[0][0].status, 'completed');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.close();
    // pg.Pool.end can resolve before the server has processed every socket's
    // Terminate message. Do not FORCE-drop and race an idle client's error event.
    for (let i = 0; i < 100; i++) {
      const { rows } = await admin.query('SELECT COUNT(*) AS cnt FROM pg_stat_activity WHERE datname = $1', [database]);
      if (Number(rows[0].cnt) === 0) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    await admin.query('DROP DATABASE ' + database);
    await admin.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
