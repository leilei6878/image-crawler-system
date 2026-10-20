const { secretsEqual } = require('./workerAuth');

function requireAdmin(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
  if (!process.env.ADMIN_API_TOKEN || !secretsEqual(token, process.env.ADMIN_API_TOKEN)) {
    return res.status(401).json({ error: 'Management authentication required' });
  }
  next();
}
module.exports = { requireAdmin };
