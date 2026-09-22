-- Add image storage fields on MySQL 8 without deleting existing data.
-- MySQL does not support ADD COLUMN IF NOT EXISTS; inspect metadata explicitly.

SET @ddl = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE images ADD COLUMN local_path TEXT DEFAULT NULL',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'images' AND column_name = 'local_path'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @ddl = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE images ADD COLUMN content_type VARCHAR(120) DEFAULT NULL',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'images' AND column_name = 'content_type'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @ddl = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE images ADD COLUMN file_size_bytes BIGINT DEFAULT NULL',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'images' AND column_name = 'file_size_bytes'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;

SET @ddl = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE images ADD COLUMN downloaded_at DATETIME DEFAULT NULL',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'images' AND column_name = 'downloaded_at'
);
PREPARE migration_stmt FROM @ddl;
EXECUTE migration_stmt;
DEALLOCATE PREPARE migration_stmt;
