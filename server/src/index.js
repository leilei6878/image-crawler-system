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
const scheduler = require('./services/scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(morgan('short'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/screenshots', express.static(path.join(__dirname, '../screenshots')));

app.use('/api/jobs', jobRoutes);
app.use('/api/hosts', hostRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/stats', statsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err.stack);
  res.status(500).json({ error: '服务器内部错误', message: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] API服务启动在端口 ${PORT}`);
  scheduler.start();
  console.log('[Scheduler] 调度器已启动');
});
