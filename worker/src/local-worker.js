const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const auth = JSON.parse(fs.readFileSync(path.join(root, 'data/local-auth.json'), 'utf8'));
process.env.HOST_KEY = auth.hostKey;
process.env.WORKER_REGISTRATION_TOKEN = auth.registrationToken;
process.env.SERVER_URL = process.env.SERVER_URL || 'http://127.0.0.1:3100';
process.env.MAX_CONCURRENCY = process.env.MAX_CONCURRENCY || '1';
require('./index');
