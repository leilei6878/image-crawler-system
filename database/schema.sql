-- ============================================
-- Distributed Image Crawler System - PostgreSQL Schema
-- ============================================

-- 1. hosts
CREATE TABLE IF NOT EXISTS hosts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  host_key VARCHAR(128) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'offline',
  max_concurrency INT NOT NULL DEFAULT 5,
  running_count INT NOT NULL DEFAULT 0,
  pending_count INT NOT NULL DEFAULT 0,
  accept_global_expand BOOLEAN NOT NULL DEFAULT TRUE,
  host_tags JSONB,
  supported_sites JSONB,
  ip_info VARCHAR(100) DEFAULT NULL,
  region VARCHAR(100) DEFAULT NULL,
  remark TEXT DEFAULT NULL,
  last_heartbeat_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hosts_status ON hosts(status);
CREATE INDEX IF NOT EXISTS idx_hosts_host_key ON hosts(host_key);

-- 2. jobs
CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  site_type VARCHAR(50) NOT NULL,
  host_id INT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  initial_urls JSONB NOT NULL,
  concurrency INT NOT NULL DEFAULT 3,
  auto_scroll_seconds INT NOT NULL DEFAULT 30,
  auto_scroll_max_rounds INT DEFAULT 10,
  page_timeout_seconds INT NOT NULL DEFAULT 60,
  max_retry_count INT NOT NULL DEFAULT 3,
  max_images INT DEFAULT NULL,
  start_mode VARCHAR(20) NOT NULL DEFAULT 'immediate',
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  finished_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (host_id) REFERENCES hosts(id)
);
CREATE INDEX IF NOT EXISTS idx_jobs_host_id ON jobs(host_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

-- 3. job_filters
CREATE TABLE IF NOT EXISTS job_filters (
  id SERIAL PRIMARY KEY,
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
  exclude_video BOOLEAN DEFAULT FALSE,
  exclude_collage BOOLEAN DEFAULT FALSE,
  only_detail_accessible BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- 4. page_tasks
CREATE TABLE IF NOT EXISTS page_tasks (
  id SERIAL PRIMARY KEY,
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
  error_message TEXT DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  finished_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (job_id) REFERENCES jobs(id),
  FOREIGN KEY (assigned_host_id) REFERENCES hosts(id)
);
CREATE INDEX IF NOT EXISTS idx_page_tasks_job_id ON page_tasks(job_id);
CREATE INDEX IF NOT EXISTS idx_page_tasks_host_id ON page_tasks(assigned_host_id);
CREATE INDEX IF NOT EXISTS idx_page_tasks_status ON page_tasks(status);

-- 5. images
CREATE TABLE IF NOT EXISTS images (
  id SERIAL PRIMARY KEY,
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
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  expand_status VARCHAR(30) NOT NULL DEFAULT 'not_expanded',
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (job_id) REFERENCES jobs(id),
  FOREIGN KEY (host_id) REFERENCES hosts(id)
);
CREATE INDEX IF NOT EXISTS idx_images_job_id ON images(job_id);

-- 6. job_logs
CREATE TABLE IF NOT EXISTS job_logs (
  id SERIAL PRIMARY KEY,
  job_id INT DEFAULT NULL,
  page_task_id INT DEFAULT NULL,
  host_id INT DEFAULT NULL,
  level VARCHAR(10) NOT NULL DEFAULT 'info',
  action VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  details JSONB DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_job_logs_job_id ON job_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_logs_created_at ON job_logs(created_at);

-- 7. host_heartbeats
CREATE TABLE IF NOT EXISTS host_heartbeats (
  id SERIAL PRIMARY KEY,
  host_id INT NOT NULL,
  cpu_usage DECIMAL(5,2) DEFAULT NULL,
  memory_usage DECIMAL(5,2) DEFAULT NULL,
  running_count INT DEFAULT 0,
  pending_count INT DEFAULT 0,
  ip_address VARCHAR(45) DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (host_id) REFERENCES hosts(id)
);

-- 8. job_screenshots
CREATE TABLE IF NOT EXISTS job_screenshots (
  id SERIAL PRIMARY KEY,
  page_task_id INT NOT NULL,
  screenshot_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (page_task_id) REFERENCES page_tasks(id)
);

-- 9. system_settings
CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  description TEXT DEFAULT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Init system settings
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
('global_max_pending_threshold', '100', 'Max pending threshold for global expand'),
('heartbeat_timeout_seconds', '90', 'Heartbeat timeout in seconds'),
('worker_pull_interval_ms', '5000', 'Worker pull interval in ms'),
('default_concurrency', '3', 'Default job concurrency')
ON CONFLICT (setting_key) DO NOTHING;

-- Init sample hosts
INSERT INTO hosts (name, host_key, status, max_concurrency, accept_global_expand, host_tags, supported_sites, remark) VALUES
('LocalDev', 'dev-host-key-001', 'offline', 5, true, '["general","test"]', '["pinterest","behance","unsplash"]', 'Local dev host'),
('CloudServer-A', 'cloud-host-key-002', 'offline', 10, true, '["general","high-perf"]', '["pinterest","behance","unsplash"]', 'Cloud ECS host')
ON CONFLICT (host_key) DO NOTHING;
