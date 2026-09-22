-- Social crawling V1 metadata tables for PostgreSQL.
-- Safe to run more than once. Does not delete or rewrite existing data.

CREATE TABLE IF NOT EXISTS social_sources (
  id SERIAL PRIMARY KEY,
  platform VARCHAR(30) NOT NULL,
  account_name VARCHAR(200) NOT NULL,
  profile_url TEXT NOT NULL,
  crawl_mode VARCHAR(30) NOT NULL DEFAULT 'historical',
  schedule_type VARCHAR(30) NOT NULL DEFAULT 'manual',
  max_items INT NOT NULL DEFAULT 50,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  last_crawled_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  rate_limit_policy TEXT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  adapter_type VARCHAR(80) NOT NULL DEFAULT 'generic_public_page_adapter',
  execution_mode VARCHAR(30) NOT NULL DEFAULT 'real',
  metadata TEXT DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_sources_platform ON social_sources(platform);
CREATE INDEX IF NOT EXISTS idx_social_sources_status ON social_sources(status);

CREATE TABLE IF NOT EXISTS social_jobs (
  id SERIAL PRIMARY KEY,
  source_id INT NOT NULL,
  job_id INT NOT NULL UNIQUE,
  crawl_mode VARCHAR(30) NOT NULL DEFAULT 'historical',
  schedule_type VARCHAR(30) NOT NULL DEFAULT 'manual',
  max_items INT NOT NULL DEFAULT 50,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  interval_seconds INT DEFAULT NULL,
  cron_expression VARCHAR(120) DEFAULT NULL,
  cursor_state TEXT DEFAULT NULL,
  next_run_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  last_run_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (source_id) REFERENCES social_sources(id),
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);
CREATE INDEX IF NOT EXISTS idx_social_jobs_source_id ON social_jobs(source_id);
CREATE INDEX IF NOT EXISTS idx_social_jobs_status ON social_jobs(status);
CREATE INDEX IF NOT EXISTS idx_social_jobs_next_run_at ON social_jobs(next_run_at);

CREATE TABLE IF NOT EXISTS social_runs (
  id SERIAL PRIMARY KEY,
  social_job_id INT NOT NULL,
  source_id INT NOT NULL,
  job_id INT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'queued',
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  finished_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  image_count INT NOT NULL DEFAULT 0,
  error_message TEXT DEFAULT NULL,
  metadata TEXT DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (social_job_id) REFERENCES social_jobs(id),
  FOREIGN KEY (source_id) REFERENCES social_sources(id),
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);
CREATE INDEX IF NOT EXISTS idx_social_runs_social_job_id ON social_runs(social_job_id);
CREATE INDEX IF NOT EXISTS idx_social_runs_source_id ON social_runs(source_id);
CREATE INDEX IF NOT EXISTS idx_social_runs_job_id ON social_runs(job_id);
CREATE INDEX IF NOT EXISTS idx_social_runs_status ON social_runs(status);
