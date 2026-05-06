const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const socialRoutes = require('./routes/social');

const app = express();
const port = process.env.PORT || 3003;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));
app.use('/api/social', socialRoutes);

const now = () => new Date().toISOString();

let nextJobId = 4;
let nextHostId = 3;
let nextTaskId = 8;
let nextImageId = 9;
let nextLogId = 5;

const hosts = [
  {
    id: 1,
    name: 'Local Worker A',
    host_key: 'local-worker-a',
    status: 'online',
    max_concurrency: 5,
    running_count: 2,
    pending_count: 3,
    accept_global_expand: true,
    host_tags: ['local', 'preview'],
    supported_sites: ['generic', 'pinterest', 'unsplash'],
    remark: 'Local preview worker',
    last_heartbeat_at: now(),
    created_at: now()
  },
  {
    id: 2,
    name: 'Edge Worker B',
    host_key: 'edge-worker-b',
    status: 'offline',
    max_concurrency: 3,
    running_count: 0,
    pending_count: 0,
    accept_global_expand: true,
    host_tags: ['edge'],
    supported_sites: ['generic', 'behance'],
    remark: 'Offline sample worker',
    last_heartbeat_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    created_at: now()
  }
];

const jobs = [
  {
    id: 1,
    name: 'Pinterest moodboard seed crawl',
    site_type: 'pinterest',
    host_id: 1,
    status: 'running',
    initial_urls: JSON.stringify(['https://www.pinterest.com/search/pins/?q=packaging%20design']),
    concurrency: 3,
    auto_scroll_seconds: 30,
    auto_scroll_max_rounds: 8,
    page_timeout_seconds: 60,
    max_retry_count: 3,
    max_images: 120,
    start_mode: 'immediate',
    scheduled_at: null,
    created_at: new Date(Date.now() - 1000 * 60 * 50).toISOString(),
    started_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    finished_at: null
  },
  {
    id: 2,
    name: 'Generic public page extraction',
    site_type: 'generic',
    host_id: 1,
    status: 'completed',
    initial_urls: JSON.stringify(['https://example.com/gallery']),
    concurrency: 2,
    auto_scroll_seconds: 15,
    auto_scroll_max_rounds: 4,
    page_timeout_seconds: 45,
    max_retry_count: 2,
    max_images: 60,
    start_mode: 'immediate',
    scheduled_at: null,
    created_at: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
    started_at: new Date(Date.now() - 1000 * 60 * 230).toISOString(),
    finished_at: new Date(Date.now() - 1000 * 60 * 180).toISOString()
  },
  {
    id: 3,
    name: 'Tomorrow brand board crawl',
    site_type: 'unsplash',
    host_id: 2,
    status: 'scheduled',
    initial_urls: JSON.stringify(['https://unsplash.com/s/photos/interior-brand']),
    concurrency: 2,
    auto_scroll_seconds: 20,
    auto_scroll_max_rounds: 5,
    page_timeout_seconds: 60,
    max_retry_count: 2,
    max_images: 80,
    start_mode: 'scheduled',
    scheduled_at: new Date(Date.now() + 1000 * 60 * 60 * 5).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    started_at: null,
    finished_at: null
  }
];

const filtersByJob = {
  1: {
    job_id: 1,
    logic_mode: 'and',
    min_like: 20,
    min_favorite: 10,
    min_comment: null,
    min_share: null,
    min_width: 320,
    min_height: 320,
    ratio_min: null,
    ratio_max: null,
    exclude_video: true,
    exclude_collage: false,
    only_detail_accessible: true
  }
};

const pageTasks = [
  { id: 1, job_id: 1, assigned_host_id: 1, task_type: 'seed', dispatch_mode: 'seed_task', target_url: 'https://www.pinterest.com/search/pins/?q=packaging%20design', priority: 10, status: 'success', retry_count: 0, error_message: null, created_at: new Date(Date.now() - 1000 * 60 * 48).toISOString() },
  { id: 2, job_id: 1, assigned_host_id: 1, task_type: 'detail', dispatch_mode: 'local_expand', target_url: 'https://example.com/pin/alpha', priority: 5, status: 'running', retry_count: 0, error_message: null, created_at: new Date(Date.now() - 1000 * 60 * 25).toISOString() },
  { id: 3, job_id: 1, assigned_host_id: 1, task_type: 'detail', dispatch_mode: 'global_auto_expand', target_url: 'https://example.com/pin/bravo', priority: 5, status: 'pending', retry_count: 0, error_message: null, created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString() },
  { id: 4, job_id: 1, assigned_host_id: 1, task_type: 'detail', dispatch_mode: 'manual_assign_expand', target_url: 'https://example.com/pin/charlie', priority: 5, status: 'failed', retry_count: 2, error_message: 'Preview timeout sample', created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString() },
  { id: 5, job_id: 2, assigned_host_id: 1, task_type: 'seed', dispatch_mode: 'seed_task', target_url: 'https://example.com/gallery', priority: 10, status: 'success', retry_count: 0, error_message: null, created_at: new Date(Date.now() - 1000 * 60 * 225).toISOString() },
  { id: 6, job_id: 2, assigned_host_id: 1, task_type: 'detail', dispatch_mode: 'local_expand', target_url: 'https://example.com/gallery/item-1', priority: 5, status: 'success', retry_count: 0, error_message: null, created_at: new Date(Date.now() - 1000 * 60 * 210).toISOString() },
  { id: 7, job_id: 3, assigned_host_id: 2, task_type: 'seed', dispatch_mode: 'seed_task', target_url: 'https://unsplash.com/s/photos/interior-brand', priority: 10, status: 'pending', retry_count: 0, error_message: null, created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString() }
];

const images = [
  { id: 1, job_id: 1, host_id: 1, page_task_id: 1, image_url: 'https://picsum.photos/id/1015/520/360', detail_page_url: 'https://example.com/pin/alpha', source_page_url: 'https://www.pinterest.com/search/pins/?q=packaging%20design', like_count: 184, favorite_count: 64, comment_count: 12, share_count: 8, width: 520, height: 360, author_name: 'Studio Alpha', author_url: 'https://example.com/studio-alpha', status: 'captured', is_favorite: false, expand_status: 'not_expanded', created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString() },
  { id: 2, job_id: 1, host_id: 1, page_task_id: 1, image_url: 'https://picsum.photos/id/1025/420/560', detail_page_url: 'https://example.com/pin/bravo', source_page_url: 'https://www.pinterest.com/search/pins/?q=packaging%20design', like_count: 92, favorite_count: 38, comment_count: 4, share_count: 3, width: 420, height: 560, author_name: 'Brand Board', author_url: 'https://example.com/brand-board', status: 'captured', is_favorite: true, expand_status: 'queued', created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString() },
  { id: 3, job_id: 1, host_id: 1, page_task_id: 1, image_url: 'https://picsum.photos/id/1035/480/640', detail_page_url: 'https://example.com/pin/charlie', source_page_url: 'https://www.pinterest.com/search/pins/?q=packaging%20design', like_count: 211, favorite_count: 74, comment_count: 19, share_count: 14, width: 480, height: 640, author_name: 'Packaging Daily', author_url: 'https://example.com/packaging-daily', status: 'captured', is_favorite: false, expand_status: 'failed', created_at: new Date(Date.now() - 1000 * 60 * 28).toISOString() },
  { id: 4, job_id: 1, host_id: 1, page_task_id: 2, image_url: 'https://picsum.photos/id/1040/640/426', detail_page_url: 'https://example.com/pin/delta', source_page_url: 'https://example.com/pin/alpha', like_count: 55, favorite_count: 13, comment_count: 2, share_count: 1, width: 640, height: 426, author_name: 'Mood Lab', author_url: 'https://example.com/mood-lab', status: 'captured', is_favorite: false, expand_status: 'not_expanded', created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString() },
  { id: 5, job_id: 2, host_id: 1, page_task_id: 5, image_url: 'https://picsum.photos/id/1050/500/500', detail_page_url: 'https://example.com/gallery/item-1', source_page_url: 'https://example.com/gallery', like_count: 0, favorite_count: 0, comment_count: 0, share_count: 0, width: 500, height: 500, author_name: 'Generic Page', author_url: 'https://example.com/gallery', status: 'captured', is_favorite: false, expand_status: 'done', created_at: new Date(Date.now() - 1000 * 60 * 210).toISOString() },
  { id: 6, job_id: 2, host_id: 1, page_task_id: 5, image_url: 'https://picsum.photos/id/1060/360/540', detail_page_url: 'https://example.com/gallery/item-2', source_page_url: 'https://example.com/gallery', like_count: 0, favorite_count: 0, comment_count: 0, share_count: 0, width: 360, height: 540, author_name: 'Generic Page', author_url: 'https://example.com/gallery', status: 'captured', is_favorite: true, expand_status: 'not_expanded', created_at: new Date(Date.now() - 1000 * 60 * 205).toISOString() },
  { id: 7, job_id: 2, host_id: 1, page_task_id: 6, image_url: 'https://picsum.photos/id/1070/600/400', detail_page_url: 'https://example.com/gallery/item-3', source_page_url: 'https://example.com/gallery/item-1', like_count: 0, favorite_count: 0, comment_count: 0, share_count: 0, width: 600, height: 400, author_name: 'Generic Page', author_url: 'https://example.com/gallery', status: 'captured', is_favorite: false, expand_status: 'not_expanded', created_at: new Date(Date.now() - 1000 * 60 * 198).toISOString() },
  { id: 8, job_id: 2, host_id: 1, page_task_id: 6, image_url: 'https://picsum.photos/id/1080/460/620', detail_page_url: 'https://example.com/gallery/item-4', source_page_url: 'https://example.com/gallery/item-1', like_count: 0, favorite_count: 0, comment_count: 0, share_count: 0, width: 460, height: 620, author_name: 'Generic Page', author_url: 'https://example.com/gallery', status: 'captured', is_favorite: false, expand_status: 'not_expanded', created_at: new Date(Date.now() - 1000 * 60 * 195).toISOString() }
];

const logs = [
  { id: 1, level: 'info', action: 'server_start', message: 'Mock API started for latest local UI preview', job_id: null, host_id: null, created_at: now() },
  { id: 2, level: 'info', action: 'host_heartbeat', message: 'Local Worker A heartbeat received', job_id: null, host_id: 1, created_at: new Date(Date.now() - 1000 * 60 * 3).toISOString() },
  { id: 3, level: 'info', action: 'job_running', message: 'Pinterest moodboard seed crawl is running', job_id: 1, host_id: 1, created_at: new Date(Date.now() - 1000 * 60 * 10).toISOString() },
  { id: 4, level: 'warn', action: 'task_failed', message: 'Preview timeout sample for one expansion task', job_id: 1, host_id: 1, created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString() }
];

function pushLog(level, action, message, details = {}) {
  logs.unshift({
    id: nextLogId++,
    level,
    action,
    message,
    job_id: details.job_id || null,
    host_id: details.host_id || null,
    created_at: now()
  });
}

function hostById(id) {
  return hosts.find((host) => host.id === Number(id));
}

function hostWithComputed(host) {
  const hostTasks = pageTasks.filter((task) => task.assigned_host_id === host.id);
  const running_count = hostTasks.filter((task) => task.status === 'running').length;
  const pending_count = hostTasks.filter((task) => ['pending', 'retry_waiting'].includes(task.status)).length;
  return {
    ...host,
    running_count,
    pending_count,
    available_slots: Math.max(0, host.max_concurrency - running_count)
  };
}

function jobWithComputed(job) {
  const host = hostById(job.host_id);
  const jobTasks = pageTasks.filter((task) => task.job_id === job.id);
  return {
    ...job,
    host_name: host?.name || null,
    host_status: host?.status || null,
    pending_tasks: jobTasks.filter((task) => ['pending', 'retry_waiting'].includes(task.status)).length,
    running_tasks: jobTasks.filter((task) => task.status === 'running').length,
    success_tasks: jobTasks.filter((task) => task.status === 'success').length,
    failed_tasks: jobTasks.filter((task) => task.status === 'failed').length,
    image_count: images.filter((image) => image.job_id === job.id && image.status !== 'deleted').length
  };
}

function paginate(items, req, prefix = '') {
  const pageKey = prefix ? `${prefix}_page` : 'page';
  const limitKey = prefix ? `${prefix}_limit` : 'limit';
  const pageNum = Number(req.query[pageKey] || req.query.page || 1);
  const limit = Number(req.query[limitKey] || req.query.limit || 50);
  const start = (pageNum - 1) * limit;
  return {
    data: items.slice(start, start + limit),
    total: items.length,
    page: pageNum,
    limit
  };
}

function imageQueryFrom(req) {
  return {
    sort_by: req.query.img_sort_by || 'created_at',
    sort_order: String(req.query.img_sort_order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc',
    min_like: req.query.img_min_like ?? '',
    min_favorite: req.query.img_min_favorite ?? '',
    min_comment: req.query.img_min_comment ?? '',
    min_share: req.query.img_min_share ?? '',
    expand_status: req.query.img_expand_status ?? ''
  };
}

function filterAndSortImages(jobId, req, includeDeleted = false) {
  const query = imageQueryFrom(req);
  const metricFilters = [
    ['min_like', 'like_count'],
    ['min_favorite', 'favorite_count'],
    ['min_comment', 'comment_count'],
    ['min_share', 'share_count']
  ];
  const sortableFields = new Set(['created_at', 'like_count', 'favorite_count', 'comment_count', 'share_count', 'width', 'height']);
  const sortBy = sortableFields.has(query.sort_by) ? query.sort_by : 'created_at';
  const direction = query.sort_order === 'asc' ? 1 : -1;

  return images
    .filter((image) => image.job_id === Number(jobId))
    .filter((image) => includeDeleted || image.status !== 'deleted')
    .filter((image) => !query.expand_status || image.expand_status === query.expand_status)
    .filter((image) => metricFilters.every(([queryKey, field]) => {
      if (query[queryKey] === '') return true;
      return Number(image[field] || 0) >= Number(query[queryKey] || 0);
    }))
    .map((image) => ({ ...image, host_name: hostById(image.host_id)?.name || null }))
    .sort((a, b) => {
      const av = sortBy === 'created_at' ? new Date(a.created_at).getTime() : Number(a[sortBy] || 0);
      const bv = sortBy === 'created_at' ? new Date(b.created_at).getTime() : Number(b[sortBy] || 0);
      if (av === bv) return b.id - a.id;
      return av > bv ? direction : -direction;
    });
}

function taskStatsForJob(jobId) {
  const jobTasks = pageTasks.filter((task) => task.job_id === Number(jobId));
  return {
    pending: jobTasks.filter((task) => ['pending', 'retry_waiting'].includes(task.status)).length,
    running: jobTasks.filter((task) => task.status === 'running').length,
    success: jobTasks.filter((task) => task.status === 'success').length,
    failed: jobTasks.filter((task) => task.status === 'failed').length
  };
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mode: 'mock', time: now() });
});

app.get('/api/stats/overview', (req, res) => {
  const activeHosts = hosts.map(hostWithComputed);
  res.json({
    jobs: {
      total_jobs: jobs.filter((job) => job.status !== 'deleted').length,
      running_jobs: jobs.filter((job) => job.status === 'running').length,
      queued_jobs: jobs.filter((job) => job.status === 'queued').length,
      completed_jobs: jobs.filter((job) => job.status === 'completed').length,
      failed_jobs: jobs.filter((job) => job.status === 'failed').length,
      paused_jobs: jobs.filter((job) => job.status === 'paused').length
    },
    hosts: {
      total_hosts: hosts.length,
      online_hosts: activeHosts.filter((host) => host.status === 'online').length,
      offline_hosts: activeHosts.filter((host) => host.status === 'offline').length
    },
    images: { total_images: images.filter((image) => image.status !== 'deleted').length },
    tasks: {
      pending_tasks: pageTasks.filter((task) => ['pending', 'retry_waiting'].includes(task.status)).length,
      running_tasks: pageTasks.filter((task) => task.status === 'running').length,
      success_tasks: pageTasks.filter((task) => task.status === 'success').length,
      failed_tasks: pageTasks.filter((task) => task.status === 'failed').length
    }
  });
});

app.get('/api/stats/logs', (req, res) => {
  const { level } = req.query;
  const filtered = level ? logs.filter((log) => log.level === level) : logs;
  res.json(paginate(filtered, req));
});

app.get('/api/hosts', (req, res) => {
  res.json({ data: hosts.map(hostWithComputed) });
});

app.get('/api/hosts/:id', (req, res) => {
  const host = hostById(req.params.id);
  if (!host) return res.status(404).json({ error: 'Host not found' });
  res.json(hostWithComputed(host));
});

app.post('/api/hosts', (req, res) => {
  const { name, host_key, max_concurrency = 5, accept_global_expand = true, host_tags = [], supported_sites = [], remark = '' } = req.body;
  if (!name || !host_key) return res.status(400).json({ error: 'Host name and host key are required' });
  if (hosts.some((host) => host.host_key === host_key)) return res.status(400).json({ error: 'Host key already exists' });

  const host = {
    id: nextHostId++,
    name,
    host_key,
    status: 'offline',
    max_concurrency,
    running_count: 0,
    pending_count: 0,
    accept_global_expand,
    host_tags,
    supported_sites,
    remark,
    last_heartbeat_at: null,
    created_at: now()
  };
  hosts.push(host);
  pushLog('info', 'host_create', `Created host: ${name}`, { host_id: host.id });
  res.status(201).json({ id: host.id, message: 'Host created' });
});

app.put('/api/hosts/:id', (req, res) => {
  const host = hostById(req.params.id);
  if (!host) return res.status(404).json({ error: 'Host not found' });
  Object.assign(host, req.body);
  pushLog('info', 'host_update', `Updated host #${host.id}`, { host_id: host.id });
  res.json({ message: 'Host updated' });
});

app.delete('/api/hosts/:id', (req, res) => {
  const host = hostById(req.params.id);
  if (!host) return res.status(404).json({ error: 'Host not found' });
  const hasActiveTasks = pageTasks.some((task) => task.assigned_host_id === host.id && ['pending', 'retry_waiting', 'running'].includes(task.status));
  if (hasActiveTasks) return res.status(400).json({ error: 'Host has active preview tasks' });
  hosts.splice(hosts.indexOf(host), 1);
  pushLog('info', 'host_delete', `Deleted host #${host.id}`, { host_id: host.id });
  res.json({ message: 'Host deleted' });
});

app.post('/api/hosts/heartbeat', (req, res) => {
  const host = hosts.find((item) => item.host_key === req.body.host_key);
  if (!host) return res.status(404).json({ error: 'Host not found in mock data' });
  host.status = 'online';
  host.last_heartbeat_at = now();
  pushLog('info', 'host_heartbeat', `Heartbeat received from ${host.name}`, { host_id: host.id });
  res.json({ host_id: host.id, message: 'Heartbeat updated', pending_count: host.pending_count, running_count: host.running_count });
});

app.get('/api/jobs', (req, res) => {
  const { status } = req.query;
  const visibleJobs = jobs
    .filter((job) => job.status !== 'deleted')
    .filter((job) => !status || job.status === status)
    .map(jobWithComputed)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(paginate(visibleJobs, req));
});

app.post('/api/jobs', (req, res) => {
  const { name, site_type, host_id, initial_urls, concurrency = 3, start_mode = 'immediate', scheduled_at = null, filters = null } = req.body;
  if (!name || !host_id || !initial_urls?.length) return res.status(400).json({ error: 'Missing required job fields' });
  if (!hostById(host_id)) return res.status(400).json({ error: 'Selected host does not exist' });

  const job = {
    id: nextJobId++,
    name,
    site_type,
    host_id: Number(host_id),
    status: start_mode === 'scheduled' ? 'scheduled' : 'queued',
    initial_urls: JSON.stringify(initial_urls),
    concurrency,
    auto_scroll_seconds: req.body.auto_scroll_seconds || 30,
    auto_scroll_max_rounds: req.body.auto_scroll_max_rounds || 10,
    page_timeout_seconds: req.body.page_timeout_seconds || 60,
    max_retry_count: req.body.max_retry_count || 3,
    max_images: req.body.max_images || null,
    start_mode,
    scheduled_at,
    created_at: now(),
    started_at: null,
    finished_at: null
  };
  jobs.push(job);
  if (filters) filtersByJob[job.id] = { ...filters, job_id: job.id };

  initial_urls.forEach((target_url) => {
    pageTasks.push({
      id: nextTaskId++,
      job_id: job.id,
      assigned_host_id: job.host_id,
      task_type: 'seed',
      dispatch_mode: 'seed_task',
      target_url,
      priority: 10,
      status: 'pending',
      retry_count: 0,
      error_message: null,
      created_at: now()
    });
  });

  pushLog('info', 'job_create', `Created job: ${name}`, { job_id: job.id, host_id: job.host_id });
  res.status(201).json({ id: job.id, message: 'Job created' });
});

app.get('/api/jobs/:id/download-images', (req, res) => {
  const job = jobs.find((item) => item.id === Number(req.params.id) && item.status !== 'deleted');
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const scope = req.query.scope === 'all' ? 'all' : 'filtered';
  const jobImages = scope === 'all'
    ? images.filter((image) => image.job_id === job.id && image.status !== 'deleted')
    : filterAndSortImages(job.id, req);
  const urls = Array.from(new Set(jobImages.map((image) => image.image_url).filter(Boolean)));
  if (urls.length === 0) return res.status(400).json({ error: 'No image URLs to export' });
  const fileName = `job_${job.id}_${scope}_image_urls.txt`;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.send(`${urls.join('\n')}\n`);
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.find((item) => item.id === Number(req.params.id) && item.status !== 'deleted');
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const jobImages = filterAndSortImages(job.id, req);
  const imagePage = paginate(jobImages, req, 'img');

  res.json({
    job: jobWithComputed(job),
    filters: filtersByJob[job.id] || null,
    images: imagePage.data,
    img_total: imagePage.total,
    image_query: imageQueryFrom(req),
    page_tasks: pageTasks
      .filter((task) => task.job_id === job.id)
      .map((task) => ({ ...task, host_name: hostById(task.assigned_host_id)?.name || null }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    task_stats: taskStatsForJob(job.id)
  });
});

function updateJobStatus(req, res, status, action) {
  const job = jobs.find((item) => item.id === Number(req.params.id) && item.status !== 'deleted');
  if (!job) return res.status(404).json({ error: 'Job not found' });
  job.status = status;
  if (status === 'running') job.started_at = job.started_at || now();
  if (['cancelled', 'completed', 'failed'].includes(status)) job.finished_at = now();
  pushLog('info', action, `Job #${job.id} changed to ${status}`, { job_id: job.id, host_id: job.host_id });
  res.json({ message: `Job ${status}` });
}

app.post('/api/jobs/:id/pause', (req, res) => updateJobStatus(req, res, 'paused', 'job_pause'));
app.post('/api/jobs/:id/resume', (req, res) => updateJobStatus(req, res, 'running', 'job_resume'));
app.post('/api/jobs/:id/cancel', (req, res) => updateJobStatus(req, res, 'cancelled', 'job_cancel'));

app.delete('/api/jobs/:id', (req, res) => {
  const job = jobs.find((item) => item.id === Number(req.params.id));
  if (!job) return res.status(404).json({ error: 'Job not found' });
  job.status = 'deleted';
  pushLog('info', 'job_delete', `Deleted job #${job.id}`, { job_id: job.id, host_id: job.host_id });
  res.json({ message: 'Job deleted' });
});

app.get('/api/images', (req, res) => {
  const { job_id, status } = req.query;
  const filtered = images
    .filter((image) => !job_id || image.job_id === Number(job_id))
    .filter((image) => !status || image.status === status)
    .filter((image) => image.status !== 'deleted')
    .map((image) => ({ ...image, host_name: hostById(image.host_id)?.name || null }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(paginate(filtered, req));
});

app.post('/api/images/:id/expand', (req, res) => {
  const image = images.find((item) => item.id === Number(req.params.id));
  if (!image) return res.status(404).json({ error: 'Image not found' });
  if (!image.detail_page_url) return res.status(400).json({ error: 'Image does not have a detail page URL' });
  if (image.expand_status !== 'not_expanded') return res.status(400).json({ error: 'Image already has an expansion task' });

  const job = jobs.find((item) => item.id === image.job_id);
  const assigned_host_id = req.body.target_host_id || job?.host_id || 1;
  const task = {
    id: nextTaskId++,
    job_id: image.job_id,
    assigned_host_id,
    task_type: 'detail',
    dispatch_mode: req.body.mode === 'auto' ? 'global_auto_expand' : req.body.mode === 'manual' ? 'manual_assign_expand' : 'local_expand',
    source_image_id: image.id,
    target_url: image.detail_page_url,
    priority: 5,
    status: 'pending',
    retry_count: 0,
    error_message: null,
    created_at: now()
  };
  pageTasks.push(task);
  image.expand_status = 'queued';
  pushLog('info', 'image_expand', `Queued expansion for image #${image.id}`, { job_id: image.job_id, host_id: assigned_host_id });
  res.json({ message: 'Expansion task created', task_id: task.id, host_id: assigned_host_id });
});

app.post('/api/images/:id/favorite', (req, res) => {
  const image = images.find((item) => item.id === Number(req.params.id));
  if (!image) return res.status(404).json({ error: 'Image not found' });
  image.is_favorite = !image.is_favorite;
  pushLog('info', 'image_favorite', `Toggled favorite for image #${image.id}`, { job_id: image.job_id, host_id: image.host_id });
  res.json({ message: image.is_favorite ? 'Image marked as favorite' : 'Image unmarked as favorite', is_favorite: image.is_favorite });
});

app.delete('/api/images/:id', (req, res) => {
  const image = images.find((item) => item.id === Number(req.params.id));
  if (!image) return res.status(404).json({ error: 'Image not found' });
  image.status = 'deleted';
  pushLog('info', 'image_delete', `Deleted image #${image.id}`, { job_id: image.job_id, host_id: image.host_id });
  res.json({ message: 'Image deleted' });
});

app.post('/api/tasks/pull', (req, res) => {
  const hostId = Number(req.body.host_id);
  const maxTasks = Number(req.body.max_tasks || 1);
  const tasks = pageTasks
    .filter((task) => task.assigned_host_id === hostId && ['pending', 'retry_waiting'].includes(task.status))
    .slice(0, maxTasks);
  tasks.forEach((task) => { task.status = 'running'; });
  res.json({ tasks });
});

app.post('/api/tasks/report', (req, res) => {
  const task = pageTasks.find((item) => item.id === Number(req.body.page_task_id));
  if (!task) return res.status(404).json({ error: 'Task not found' });
  task.status = req.body.status || 'success';
  task.error_message = req.body.error_message || null;
  if (Array.isArray(req.body.images)) {
    req.body.images.forEach((img) => {
      images.push({
        id: nextImageId++,
        job_id: task.job_id,
        host_id: req.body.host_id || task.assigned_host_id,
        page_task_id: task.id,
        image_url: img.image_url,
        detail_page_url: img.detail_page_url || null,
        source_page_url: img.source_page_url || task.target_url,
        like_count: img.like_count || 0,
        favorite_count: img.favorite_count || 0,
        comment_count: img.comment_count || 0,
        share_count: img.share_count || 0,
        width: img.width || null,
        height: img.height || null,
        author_name: img.author_name || null,
        author_url: img.author_url || null,
        status: 'captured',
        is_favorite: false,
        expand_status: 'not_expanded',
        created_at: now()
      });
    });
  }
  res.json({ message: 'Task report accepted' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Image crawler mock API listening on http://localhost:${port}`);
});
