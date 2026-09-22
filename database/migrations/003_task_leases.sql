-- Task lease metadata for PostgreSQL.
-- Safe to run after the existing page_tasks table. Does not delete data.

ALTER TABLE page_tasks ADD COLUMN IF NOT EXISTS lease_token VARCHAR(120) DEFAULT NULL;
ALTER TABLE page_tasks ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_page_tasks_lease_expires_at ON page_tasks(lease_expires_at);
