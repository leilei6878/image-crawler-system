const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');

async function migrate(config) {
  const client = new Client(config);
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock(934721)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    const root = path.resolve(__dirname, '../../database');
    const exists = await client.query("SELECT to_regclass('public.jobs') AS name");
    if (!exists.rows[0].name) {
      await client.query('BEGIN');
      try {
        await client.query(await fs.readFile(path.join(root, 'schema.sql'), 'utf8'));
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
    const files = (await fs.readdir(path.join(root, 'migrations'))).filter(name => /^\d+_.*\.sql$/.test(name) && !name.endsWith('_mysql.sql')).sort();
    for (const name of files) {
      const sql = await fs.readFile(path.join(root, 'migrations', name), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const applied = await client.query('SELECT checksum FROM schema_migrations WHERE version=$1', [name]);
      if (applied.rows.length) {
        if (applied.rows[0].checksum !== checksum) throw new Error('Applied migration changed: ' + name);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(version,checksum) VALUES ($1,$2)', [name, checksum]);
        await client.query('COMMIT');
        console.log('Applied migration:', name);
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
  } finally { await client.end(); }
}
module.exports = { migrate };
if (require.main === module) {
  const root = path.resolve(__dirname, '../..');
  const localFile = path.join(root, 'data/local-db.json');
  const operation = (async () => {
    if (process.argv.includes('--local')) {
      return migrate(JSON.parse((await fs.readFile(localFile, 'utf8')).replace(/^\uFEFF/, '')));
    }
    if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL or use --local for the isolated local database.');
    await migrate({ connectionString: process.env.DATABASE_URL });
  })();
  operation.catch(error => { console.error(error.message); process.exitCode = 1; });
}
