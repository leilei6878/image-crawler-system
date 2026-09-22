const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const db = JSON.parse(fs.readFileSync(path.join(root, 'data/local-db.json'), 'utf8').replace(/^\uFEFF/, ''));
const authFile = path.join(root, 'data/local-auth.json');
if (!fs.existsSync(authFile)) {
  const secret = () => crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(authFile, JSON.stringify({ adminToken: secret(), registrationToken: secret(), hostKey: secret() }, null, 2), { flag: 'wx' });
}
const auth = JSON.parse(fs.readFileSync(authFile, 'utf8'));
const dbUrl = new URL('postgresql://127.0.0.1');
dbUrl.username = db.user;
dbUrl.password = db.password;
dbUrl.port = db.port;
dbUrl.pathname = '/' + db.database;
process.env.DATABASE_URL = dbUrl.href;
process.env.ADMIN_API_TOKEN = auth.adminToken;
process.env.WORKER_REGISTRATION_TOKEN = auth.registrationToken;
process.env.BIND_HOST = '127.0.0.1';
process.env.PORT = process.env.PORT || '3100';
process.chdir(path.join(root, 'server'));
require('../src/index').startServer();
