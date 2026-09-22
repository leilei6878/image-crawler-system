-- Social crawling V1 metadata tables for MySQL.
-- Safe to run more than once. Does not delete or rewrite existing data.

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
