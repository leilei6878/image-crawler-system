-- Task lease metadata for MySQL 8.
-- Safe to run after the existing page_tasks table. Does not delete data.

SET @add_lease_token = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE page_tasks ADD COLUMN lease_token VARCHAR(120) DEFAULT NULL',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'page_tasks' AND column_name = 'lease_token'
);
PREPARE add_lease_token_stmt FROM @add_lease_token;
EXECUTE add_lease_token_stmt;
DEALLOCATE PREPARE add_lease_token_stmt;

SET @add_lease_expires_at = (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE page_tasks ADD COLUMN lease_expires_at DATETIME DEFAULT NULL',
    'SELECT 1')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'page_tasks' AND column_name = 'lease_expires_at'
);
PREPARE add_lease_expires_at_stmt FROM @add_lease_expires_at;
EXECUTE add_lease_expires_at_stmt;
DEALLOCATE PREPARE add_lease_expires_at_stmt;

SET @add_lease_index = (
  SELECT IF(COUNT(*) = 0,
    'CREATE INDEX idx_page_tasks_lease_expires_at ON page_tasks(lease_expires_at)',
    'SELECT 1')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'page_tasks' AND index_name = 'idx_page_tasks_lease_expires_at'
);
PREPARE add_lease_index_stmt FROM @add_lease_index;
EXECUTE add_lease_index_stmt;
DEALLOCATE PREPARE add_lease_index_stmt;
