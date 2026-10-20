-- ============================================
-- Distributed Image Crawler System - MySQL Schema
-- ============================================

CREATE DATABASE IF NOT EXISTS image_crawler DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE image_crawler;

-- 1. hosts
CREATE TABLE IF NOT EXISTS hosts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  host_key VARCHAR(128) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'offline',
  max_concurrency INT NOT NULL DEFAULT 5,
  running_count INT NOT NULL DEFAULT 0,
  pending_count INT NOT NULL DEFAULT 0,
  accept_global_expand TINYINT(1) NOT NULL DEFAULT 1,
  host_tags JSON,
  supported_sites JSON,
  ip_info VARCHAR(100) DEFAULT NULL,
  region VARCHAR(100) DEFAULT NULL,
  remark TEXT DEFAULT NULL,
  last_heartbeat_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_hosts_status (status),
  INDEX idx_hosts_host_key (host_key)
) ENGINE=InnoDB;

-- 2. jobs
CREATE TABLE IF NOT EXISTS jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  site_type VARCHAR(50) NOT NULL,
  host_id INT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  initial_urls JSON NOT NULL,
  concurrency INT NOT NULL DEFAULT 3,
  auto_scroll_seconds INT NOT NULL DEFAULT 30,
  auto_scroll_max_rounds INT DEFAULT 10,
  page_timeout_seconds INT NOT NULL DEFAULT 60,
  max_retry_count INT NOT NULL DEFAULT 3,
  max_images INT DEFAULT NULL,
  start_mode VARCHAR(20) NOT NULL DEFAULT 'immediate',
  scheduled_at DATETIME DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME DEFAULT NULL,
  finished_at DATETIME DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_jobs_host_id (host_id),
  INDEX idx_jobs_status (status),
  FOREIGN KEY (host_id) REFERENCES hosts(id)
) ENGINE=InnoDB;

-- 3. job_filters
CREATE TABLE IF NOT EXISTS job_filters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  logic_mode VARCHAR(10) NOT NULL DEFAULT 'and',
  min_like INT DEFAULT NULL,
  min_favorite INT DEFAULT NULL,
  min_comment INT DEFAULT NULL,
  min_share INT DEFAULT NULL,
  min_width INT DEFAULT NULL,
  min_height INT DEFAULT NULL,
  ratio_min DECIMAL(5,2) DEFAULT NULL,
  ratio_max DECIMAL(5,2) DEFAULT NULL,
  exclude_video TINYINT(1) DEFAULT 0,
  exclude_collage TINYINT(1) DEFAULT 0,
  only_detail_accessible TINYINT(1) DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. page_tasks
CREATE TABLE IF NOT EXISTS page_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  assigned_host_id INT NOT NULL,
  parent_task_id INT DEFAULT NULL,
  task_type VARCHAR(30) NOT NULL DEFAULT 'seed',
  dispatch_mode VARCHAR(50) NOT NULL DEFAULT 'seed_task',
  source_image_id INT DEFAULT NULL,
  target_url TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  lease_token VARCHAR(120) DEFAULT NULL,
  lease_expires_at DATETIME DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME DEFAULT NULL,
  finished_at DATETIME DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_page_tasks_job_id (job_id),
  INDEX idx_page_tasks_host_id (assigned_host_id),
  INDEX idx_page_tasks_status (status),
  FOREIGN KEY (job_id) REFERENCES jobs(id),
  FOREIGN KEY (assigned_host_id) REFERENCES hosts(id)
) ENGINE=InnoDB;

-- 5. images
CREATE TABLE IF NOT EXISTS images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  host_id INT DEFAULT NULL,
  page_task_id INT DEFAULT NULL,
  image_url TEXT NOT NULL,
  detail_page_url TEXT DEFAULT NULL,
  source_page_url TEXT DEFAULT NULL,
  author_name VARCHAR(200) DEFAULT NULL,
  author_url TEXT DEFAULT NULL,
  width INT DEFAULT NULL,
  height INT DEFAULT NULL,
  like_count INT DEFAULT NULL,
  favorite_count INT DEFAULT NULL,
  comment_count INT DEFAULT NULL,
  share_count INT DEFAULT NULL,
  local_path TEXT DEFAULT NULL,
  content_type VARCHAR(120) DEFAULT NULL,
  file_size_bytes BIGINT DEFAULT NULL,
  downloaded_at DATETIME DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  expand_status VARCHAR(30) NOT NULL DEFAULT 'not_expanded',
  is_favorite TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_images_job_id (job_id),
  FOREIGN KEY (job_id) REFERENCES jobs(id),
  FOREIGN KEY (host_id) REFERENCES hosts(id)
) ENGINE=InnoDB;

-- 6. job_logs
CREATE TABLE IF NOT EXISTS job_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT DEFAULT NULL,
  page_task_id INT DEFAULT NULL,
  host_id INT DEFAULT NULL,
  level VARCHAR(10) NOT NULL DEFAULT 'info',
  action VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  details JSON DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_job_logs_job_id (job_id),
  INDEX idx_job_logs_created_at (created_at)
) ENGINE=InnoDB;

-- 7. host_heartbeats
CREATE TABLE IF NOT EXISTS host_heartbeats (
  id INT AUTO_INCREMENT PRIMARY KEY,
  host_id INT NOT NULL,
  cpu_usage DECIMAL(5,2) DEFAULT NULL,
  memory_usage DECIMAL(5,2) DEFAULT NULL,
  running_count INT DEFAULT 0,
  pending_count INT DEFAULT 0,
  ip_address VARCHAR(45) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (host_id) REFERENCES hosts(id)
) ENGINE=InnoDB;

-- 8. job_screenshots
CREATE TABLE IF NOT EXISTS job_screenshots (
  id INT AUTO_INCREMENT PRIMARY KEY,
  page_task_id INT NOT NULL,
  screenshot_path TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (page_task_id) REFERENCES page_tasks(id)
) ENGINE=InnoDB;

-- 9. system_settings
CREATE TABLE IF NOT EXISTS system_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  description TEXT DEFAULT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Init system settings
INSERT IGNORE INTO system_settings (setting_key, setting_value, description) VALUES
('global_max_pending_threshold', '100', 'Max pending threshold for global expand'),
('heartbeat_timeout_seconds', '90', 'Heartbeat timeout in seconds'),
('worker_pull_interval_ms', '5000', 'Worker pull interval in ms'),
('default_concurrency', '3', 'Default job concurrency');

-- Worker hosts are registered with locally generated credentials.

-- 10. social_sources
CREATE TABLE IF NOT EXISTS social_sources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  platform VARCHAR(30) NOT NULL,
  account_name VARCHAR(200) NOT NULL,
  profile_url TEXT NOT NULL,
  crawl_mode VARCHAR(30) NOT NULL DEFAULT 'historical',
  schedule_type VARCHAR(30) NOT NULL DEFAULT 'manual',
  max_items INT NOT NULL DEFAULT 50,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  last_crawled_at DATETIME DEFAULT NULL,
  rate_limit_policy TEXT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  adapter_type VARCHAR(80) NOT NULL DEFAULT 'generic_public_page_adapter',
  execution_mode VARCHAR(30) NOT NULL DEFAULT 'real',
  metadata TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_social_sources_platform (platform),
  INDEX idx_social_sources_status (status)
) ENGINE=InnoDB;

-- 11. social_jobs
CREATE TABLE IF NOT EXISTS social_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  source_id INT NOT NULL,
  job_id INT NOT NULL UNIQUE,
  crawl_mode VARCHAR(30) NOT NULL DEFAULT 'historical',
  schedule_type VARCHAR(30) NOT NULL DEFAULT 'manual',
  max_items INT NOT NULL DEFAULT 50,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  interval_seconds INT DEFAULT NULL,
  cron_expression VARCHAR(120) DEFAULT NULL,
  cursor_state TEXT DEFAULT NULL,
  next_run_at DATETIME DEFAULT NULL,
  last_run_at DATETIME DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_social_jobs_source_id (source_id),
  INDEX idx_social_jobs_status (status),
  INDEX idx_social_jobs_next_run_at (next_run_at),
  FOREIGN KEY (source_id) REFERENCES social_sources(id),
  FOREIGN KEY (job_id) REFERENCES jobs(id)
) ENGINE=InnoDB;

-- 12. social_runs
CREATE TABLE IF NOT EXISTS social_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  social_job_id INT NOT NULL,
  source_id INT NOT NULL,
  job_id INT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  started_at DATETIME DEFAULT NULL,
  finished_at DATETIME DEFAULT NULL,
  image_count INT NOT NULL DEFAULT 0,
  error_message TEXT DEFAULT NULL,
  metadata TEXT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_social_runs_social_job_id (social_job_id),
  INDEX idx_social_runs_source_id (source_id),
  INDEX idx_social_runs_job_id (job_id),
  INDEX idx_social_runs_status (status),
  FOREIGN KEY (social_job_id) REFERENCES social_jobs(id),
  FOREIGN KEY (source_id) REFERENCES social_sources(id),
  FOREIGN KEY (job_id) REFERENCES jobs(id)
) ENGINE=InnoDB;
