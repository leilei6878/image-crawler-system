-- Local image download metadata for PostgreSQL.
-- Safe to run more than once. Does not download files or clear existing data.

ALTER TABLE images ADD COLUMN IF NOT EXISTS local_path TEXT DEFAULT NULL;
ALTER TABLE images ADD COLUMN IF NOT EXISTS content_type VARCHAR(120) DEFAULT NULL;
ALTER TABLE images ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT DEFAULT NULL;
ALTER TABLE images ADD COLUMN IF NOT EXISTS downloaded_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
