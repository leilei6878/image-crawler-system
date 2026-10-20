const policy = require('../../../shared/publicHttp');
async function inspectPublicHttpUrl(value, label) {
  try { return { allowed: true, url: await policy.assertPublicHttpUrl(value, label) }; }
  catch (error) { return { allowed: false, reason: error.message }; }
}
module.exports = { ...policy, inspectPublicHttpUrl };
