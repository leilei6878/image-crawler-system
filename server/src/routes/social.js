const express = require('express');

const router = express.Router();

const platforms = ['xiaohongshu', 'weibo', 'instagram', 'pinterest', 'tiktok', 'website', 'other'];
const crawlModes = ['historical', 'incremental', 'temporary'];
const scheduleTypes = ['manual', 'interval', 'cron'];

const now = () => new Date().toISOString();

let nextSourceId = 3;
let nextJobId = 3;
let nextRunId = 3;

const sources = [
  {
    id: 1,
    platform: 'website',
    account_name: 'Example Brand Site',
    profile_url: 'https://example.com/gallery',
    crawl_mode: 'historical',
    schedule_type: 'manual',
    max_items: 80,
    status: 'active',
    last_crawled_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    rate_limit_policy: {
      requests_per_minute: 12,
      min_delay_seconds: 5,
      burst: 2
    },
    notes: 'Generic public page adapter preview source.',
    adapter: 'generic_public_page_adapter',
    created_at: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 120).toISOString()
  },
  {
    id: 2,
    platform: 'instagram',
    account_name: 'Mock Brand Social',
    profile_url: 'https://example.com/public/mock-brand',
    crawl_mode: 'incremental',
    schedule_type: 'interval',
    max_items: 40,
    status: 'active',
    last_crawled_at: null,
    rate_limit_policy: {
      requests_per_minute: 6,
      min_delay_seconds: 10,
      burst: 1
    },
    notes: 'Mock adapter only. No login, cookies, or platform API bypass.',
    adapter: 'mock_social_adapter',
    created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 90).toISOString()
  }
];

const jobs = [
  {
    id: 1,
    source_id: 1,
    crawl_mode: 'historical',
    schedule_type: 'manual',
    max_items: 80,
    status: 'completed',
    interval_seconds: null,
    cron_expression: null,
    notes: 'Initial public page extraction preview.',
    created_at: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    started_at: new Date(Date.now() - 1000 * 60 * 122).toISOString(),
    finished_at: new Date(Date.now() - 1000 * 60 * 120).toISOString()
  },
  {
    id: 2,
    source_id: 2,
    crawl_mode: 'incremental',
    schedule_type: 'interval',
    max_items: 40,
    status: 'scheduled',
    interval_seconds: 3600,
    cron_expression: null,
    notes: 'Interval mock job for brand account architecture.',
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    started_at: null,
    finished_at: null
  }
];

const runs = [
  {
    id: 1,
    job_id: 1,
    source_id: 1,
    status: 'completed',
    started_at: new Date(Date.now() - 1000 * 60 * 122).toISOString(),
    finished_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    image_count: 3,
    error: null,
    images: [
      {
        id: 'img-1',
        source_name: 'Example Brand Site',
        source_url: 'https://example.com/gallery',
        image_url: 'https://picsum.photos/id/1011/640/420',
        normalized_image_url: 'https://picsum.photos/id/1011/640/420',
        title: 'Public gallery image',
        alt_text: 'Generic public page preview image',
        width: 640,
        height: 420,
        content_type: 'image/jpeg',
        discovered_at: new Date(Date.now() - 1000 * 60 * 121).toISOString(),
        metadata: { adapter: 'generic_public_page_adapter', public_content_only: true }
      },
      {
        id: 'img-2',
        source_name: 'Example Brand Site',
        source_url: 'https://example.com/gallery',
        image_url: 'https://picsum.photos/id/1021/520/520',
        normalized_image_url: 'https://picsum.photos/id/1021/520/520',
        title: 'Open graph image',
        alt_text: 'Open graph preview asset',
        width: 520,
        height: 520,
        content_type: 'image/jpeg',
        discovered_at: new Date(Date.now() - 1000 * 60 * 121).toISOString(),
        metadata: { adapter: 'generic_public_page_adapter', extraction: 'og:image' }
      },
      {
        id: 'img-3',
        source_name: 'Example Brand Site',
        source_url: 'https://example.com/gallery',
        image_url: 'https://picsum.photos/id/1031/420/620',
        normalized_image_url: 'https://picsum.photos/id/1031/420/620',
        title: 'Srcset candidate',
        alt_text: 'Responsive image candidate',
        width: 420,
        height: 620,
        content_type: 'image/jpeg',
        discovered_at: new Date(Date.now() - 1000 * 60 * 121).toISOString(),
        metadata: { adapter: 'generic_public_page_adapter', extraction: 'img[srcset]' }
      }
    ]
  }
];

function adapterForPlatform(platform) {
  return platform === 'website' ? 'generic_public_page_adapter' : 'mock_social_adapter';
}

function sourceById(id) {
  return sources.find((source) => source.id === Number(id));
}

function jobById(id) {
  return jobs.find((job) => job.id === Number(id));
}

function ensureChoice(value, allowed, fieldName) {
  if (!allowed.includes(value)) {
    throw new Error(`${fieldName} must be one of: ${allowed.join(', ')}`);
  }
}

function validatePublicUrl(value) {
  if (!value || typeof value !== 'string') {
    throw new Error('profile_url is required');
  }

  const trimmed = value.trim();
  if (/^(data|javascript):/i.test(trimmed)) {
    throw new Error('profile_url must be a public http(s) URL');
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (err) {
    throw new Error('profile_url must be a valid URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('profile_url must use http or https');
  }

  return parsed.toString();
}

function normalizeRateLimit(raw = {}) {
  const requestsPerMinute = Number(raw.requests_per_minute || 6);
  const minDelaySeconds = Number(raw.min_delay_seconds || 10);
  const burst = Number(raw.burst || 1);

  if (requestsPerMinute <= 0 || minDelaySeconds < 0 || burst <= 0) {
    throw new Error('rate_limit_policy values must be positive');
  }

  return {
    requests_per_minute: requestsPerMinute,
    min_delay_seconds: minDelaySeconds,
    burst
  };
}

function sourceWithStats(source) {
  const sourceJobs = jobs.filter((job) => job.source_id === source.id);
  const sourceRuns = runs.filter((run) => run.source_id === source.id);
  const imageCount = sourceRuns.reduce((sum, run) => sum + Number(run.image_count || 0), 0);
  const lastRun = sourceRuns
    .slice()
    .sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0))[0] || null;

  return {
    ...source,
    job_count: sourceJobs.length,
    run_count: sourceRuns.length,
    image_count: imageCount,
    last_run_status: lastRun?.status || null
  };
}

function jobWithSource(job) {
  const source = sourceById(job.source_id);
  const jobRuns = runs.filter((run) => run.job_id === job.id);
  const lastRun = jobRuns
    .slice()
    .sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0))[0] || null;

  return {
    ...job,
    platform: source?.platform || null,
    account_name: source?.account_name || null,
    profile_url: source?.profile_url || null,
    adapter: source?.adapter || null,
    run_count: jobRuns.length,
    image_count: jobRuns.reduce((sum, run) => sum + Number(run.image_count || 0), 0),
    last_run: lastRun
      ? {
          id: lastRun.id,
          status: lastRun.status,
          started_at: lastRun.started_at,
          finished_at: lastRun.finished_at,
          image_count: lastRun.image_count,
          error: lastRun.error
        }
      : null
  };
}

function createPreviewImages(source, job, runId) {
  const count = Math.max(1, Math.min(Number(job.max_items || source.max_items || 2), 6));
  return Array.from({ length: Math.min(count, 3) }, (_, index) => {
    const imageId = 1040 + ((source.id + job.id + index) % 40);
    const width = index === 1 ? 520 : 640;
    const height = index === 2 ? 620 : 420;
    return {
      id: `run-${runId}-img-${index + 1}`,
      source_name: source.account_name,
      source_url: source.profile_url,
      image_url: `https://picsum.photos/id/${imageId}/${width}/${height}`,
      normalized_image_url: `https://picsum.photos/id/${imageId}/${width}/${height}`,
      title: `${source.account_name} public asset ${index + 1}`,
      alt_text: `Preview public image ${index + 1}`,
      width,
      height,
      content_type: 'image/jpeg',
      discovered_at: now(),
      metadata: {
        adapter: source.adapter,
        platform: source.platform,
        public_content_only: true,
        run_id: runId
      }
    };
  });
}

router.get('/meta', (req, res) => {
  res.json({
    platforms,
    crawl_modes: crawlModes,
    schedule_types: scheduleTypes,
    adapters: [
      { name: 'mock_social_adapter', platforms: platforms.filter((platform) => platform !== 'website') },
      { name: 'generic_public_page_adapter', platforms: ['website'] }
    ]
  });
});

router.get('/sources', (req, res) => {
  const { platform, status } = req.query;
  const data = sources
    .filter((source) => !platform || source.platform === platform)
    .filter((source) => !status || source.status === status)
    .map(sourceWithStats)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ data, total: data.length });
});

router.post('/sources', (req, res) => {
  try {
    const platform = req.body.platform || 'website';
    const crawlMode = req.body.crawl_mode || 'historical';
    const scheduleType = req.body.schedule_type || 'manual';

    ensureChoice(platform, platforms, 'platform');
    ensureChoice(crawlMode, crawlModes, 'crawl_mode');
    ensureChoice(scheduleType, scheduleTypes, 'schedule_type');

    const profileUrl = validatePublicUrl(req.body.profile_url);
    const accountName = String(req.body.account_name || '').trim();
    if (!accountName) {
      return res.status(400).json({ error: 'account_name is required' });
    }

    const maxItems = Number(req.body.max_items || 50);
    if (maxItems <= 0 || maxItems > 1000) {
      return res.status(400).json({ error: 'max_items must be between 1 and 1000' });
    }

    const source = {
      id: nextSourceId++,
      platform,
      account_name: accountName,
      profile_url: profileUrl,
      crawl_mode: crawlMode,
      schedule_type: scheduleType,
      max_items: maxItems,
      status: 'active',
      last_crawled_at: null,
      rate_limit_policy: normalizeRateLimit(req.body.rate_limit_policy),
      notes: String(req.body.notes || '').trim(),
      adapter: adapterForPlatform(platform),
      created_at: now(),
      updated_at: now()
    };

    sources.push(source);
    res.status(201).json(sourceWithStats(source));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/jobs', (req, res) => {
  const { status, source_id } = req.query;
  const data = jobs
    .filter((job) => !status || job.status === status)
    .filter((job) => !source_id || job.source_id === Number(source_id))
    .map(jobWithSource)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json({ data, total: data.length });
});

router.post('/jobs', (req, res) => {
  try {
    const source = sourceById(req.body.source_id);
    if (!source) {
      return res.status(404).json({ error: 'source not found' });
    }

    const crawlMode = req.body.crawl_mode || source.crawl_mode || 'historical';
    const scheduleType = req.body.schedule_type || source.schedule_type || 'manual';
    ensureChoice(crawlMode, crawlModes, 'crawl_mode');
    ensureChoice(scheduleType, scheduleTypes, 'schedule_type');

    const maxItems = Number(req.body.max_items || source.max_items || 50);
    if (maxItems <= 0 || maxItems > 1000) {
      return res.status(400).json({ error: 'max_items must be between 1 and 1000' });
    }

    const job = {
      id: nextJobId++,
      source_id: source.id,
      crawl_mode: crawlMode,
      schedule_type: scheduleType,
      max_items: maxItems,
      status: scheduleType === 'manual' ? 'queued' : 'scheduled',
      interval_seconds: req.body.interval_seconds ? Number(req.body.interval_seconds) : null,
      cron_expression: req.body.cron_expression || null,
      notes: String(req.body.notes || '').trim(),
      created_at: now(),
      updated_at: now(),
      started_at: null,
      finished_at: null
    };

    jobs.push(job);
    res.status(201).json(jobWithSource(job));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/jobs/:id/status', (req, res) => {
  const job = jobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'job not found' });
  res.json(jobWithSource(job));
});

router.post('/jobs/:id/run', (req, res) => {
  const job = jobById(req.params.id);
  if (!job) return res.status(404).json({ error: 'job not found' });

  const source = sourceById(job.source_id);
  if (!source) return res.status(404).json({ error: 'source not found' });
  if (source.status !== 'active') return res.status(400).json({ error: 'source is not active' });
  if (job.status === 'running') return res.status(400).json({ error: 'job is already running' });

  const startedAt = now();
  job.status = 'running';
  job.started_at = startedAt;
  job.updated_at = startedAt;

  const run = {
    id: nextRunId++,
    job_id: job.id,
    source_id: source.id,
    status: 'running',
    started_at: startedAt,
    finished_at: null,
    image_count: 0,
    error: null,
    images: []
  };
  runs.unshift(run);

  const images = createPreviewImages(source, job, run.id);
  const finishedAt = now();
  run.images = images;
  run.image_count = images.length;
  run.status = 'completed';
  run.finished_at = finishedAt;

  job.status = ['interval', 'cron'].includes(job.schedule_type) ? 'scheduled' : 'completed';
  job.finished_at = finishedAt;
  job.updated_at = finishedAt;

  source.last_crawled_at = finishedAt;
  source.updated_at = finishedAt;

  res.json({
    job: jobWithSource(job),
    run
  });
});

router.get('/runs', (req, res) => {
  const { job_id, source_id } = req.query;
  const data = runs
    .filter((run) => !job_id || run.job_id === Number(job_id))
    .filter((run) => !source_id || run.source_id === Number(source_id))
    .map((run) => ({
      ...run,
      source: sourceWithStats(sourceById(run.source_id) || {}),
      job: jobWithSource(jobById(run.job_id) || {})
    }))
    .sort((a, b) => new Date(b.started_at || 0) - new Date(a.started_at || 0));
  res.json({ data, total: data.length });
});

module.exports = router;
