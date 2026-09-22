require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

const jobRoutes = require('./routes/jobs');
const hostRoutes = require('./routes/hosts');
const imageRoutes = require('./routes/images');
const taskRoutes = require('./routes/tasks');
const statsRoutes = require('./routes/stats');
const socialRoutes = require('./routes/social');
const scheduler = require('./services/scheduler');
const db = require('./db');
const { requireAdmin } = require('./services/adminAuth');

const app = express();
const PORT = process.env.PORT || 3000;
const BIND_HOST = process.env.BIND_HOST || process.env.HOST || '127.0.0.1';

app.use(cors({ origin: process.env.WEB_ORIGIN || false }));
app.use(morgan(':method :url :status :response-time ms', { skip: req => req.path === '/api/health' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', (req, res, next) => {
  if ((req.path === '/health' && req.method === 'GET') ||
      (req.path === '/hosts/heartbeat' && req.method === 'POST') ||
      (req.path.startsWith('/tasks/') && req.method === 'POST')) return next();
  return requireAdmin(req, res, next);
});

app.use('/api/jobs', jobRoutes);
app.use('/api/hosts', hostRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/social', socialRoutes);

app.get('/api/health', async (req, res) => {
  try {
    await db.execute('SELECT 1');
    res.json({ status: 'ok', app: 'image-crawler-system', execution_mode: 'real', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'unavailable', app: 'image-crawler-system' });
  }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found' }));
const webRoot = path.resolve(__dirname, '../../web/dist');
app.use(express.static(webRoot));
app.get('*', (_req, res) => res.sendFile(path.join(webRoot, 'index.html')));

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(500).json({ error: '服务器内部错误', message: err.message });
});

function startServer() {
  if (!process.env.ADMIN_API_TOKEN || process.env.ADMIN_API_TOKEN.length < 32) {
    throw new Error('ADMIN_API_TOKEN must contain at least 32 characters');
  }
  return app.listen(PORT, BIND_HOST, () => {
  console.log(`[Server] API服务启动在 ${BIND_HOST}:${PORT}`);
  scheduler.start();
  console.log('[Scheduler] 调度器已启动');
  });
}
module.exports = { app, startServer };
if (require.main === module) startServer();
