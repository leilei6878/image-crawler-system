# Database Migrations

This project keeps schema changes explicit. Do not delete or recreate an
existing database as part of normal development or recovery.

## Current V1 Migration

Social crawling V1 adds three metadata tables:

- `social_sources`
- `social_jobs`
- `social_runs`

The migration files are:

- PostgreSQL: `database/migrations/001_social_crawling.sql`
- MySQL: `database/migrations/001_social_crawling_mysql.sql`

Both scripts use `CREATE TABLE IF NOT EXISTS` and only add social crawling
metadata tables. They do not clear `jobs`, `page_tasks`, `images`, or any
existing worker state.

Image download metadata is added by:

- PostgreSQL: `database/migrations/002_image_download_storage.sql`
- MySQL: `database/migrations/002_image_download_storage_mysql.sql`

This adds local download metadata columns to `images`. Downloaded files are
stored under `downloads/`, which is intentionally ignored by Git.

Task lease metadata is added by:

- PostgreSQL: `database/migrations/003_task_leases.sql`
- MySQL: `database/migrations/003_task_leases_mysql.sql`

This adds `lease_token` and `lease_expires_at` to `page_tasks`. A Worker must
return the lease it received when claiming a task; stale or duplicate reports
are ignored. The migration only adds columns and an index.

## Backup Before Applying

PostgreSQL example:

```sh
pg_dump "$DATABASE_URL" > backup_before_social_crawling.sql
```

MySQL example:

```sh
mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p "$DB_NAME" > backup_before_social_crawling.sql
```

Keep backups outside Git. Database dumps can contain private URLs, crawl
targets, host keys, and other local operational data.

## Apply Migration

PostgreSQL:

```sh
psql "$DATABASE_URL" -f database/migrations/001_social_crawling.sql
psql "$DATABASE_URL" -f database/migrations/002_image_download_storage.sql
psql "$DATABASE_URL" -f database/migrations/003_task_leases.sql
```

MySQL:

```sh
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p "$DB_NAME" < database/migrations/001_social_crawling_mysql.sql
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p "$DB_NAME" < database/migrations/002_image_download_storage_mysql.sql
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p "$DB_NAME" < database/migrations/003_task_leases_mysql.sql
```

Use PostgreSQL unless `DB_CLIENT=mysql` is configured for the Node management
server.

## Restore

Stop the Node management server and workers before restoring a database backup.

PostgreSQL:

```sh
psql "$DATABASE_URL" -f backup_before_social_crawling.sql
```

MySQL:

```sh
mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p "$DB_NAME" < backup_before_social_crawling.sql
```

After restore, start the management server first, confirm `/api/health`, then
start workers.
