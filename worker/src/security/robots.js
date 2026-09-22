const robotsParser = require('robots-parser');
const { fetchPublic, PublicHttpError } = require('../../../shared/publicHttp');
const USER_AGENT = 'image-crawler-system/1.0';

function isAllowedByRobots(text, url) {
  return robotsParser(new URL('/robots.txt', url).href, String(text)).isAllowed(url, USER_AGENT) === true;
}

async function assertRobotsAllowed(url, timeoutMs = 10000) {
  const response = await fetchPublic(new URL('/robots.txt', url).href, {
    timeoutMs, maxBytes: 512 * 1024, maxRedirects: 0, userAgent: USER_AGENT,
  });
  if ([404, 410].includes(response.status)) return;
  if (response.status !== 200) {
    throw new PublicHttpError('ROBOTS_UNAVAILABLE', 'robots.txt returned HTTP ' + response.status);
  }
  const parser = robotsParser(new URL('/robots.txt', url).href, response.body.toString('utf8'));
  if (!parser.isAllowed(url, USER_AGENT)) {
    throw new PublicHttpError('POLICY_DENIED', 'robots.txt disallows this public page');
  }
  const delay = parser.getCrawlDelay(USER_AGENT) || 0;
  if (delay > 30) throw new PublicHttpError('POLICY_DENIED', 'robots crawl-delay exceeds this bounded run');
  if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay * 1000));
}
module.exports = { assertRobotsAllowed, isAllowedByRobots, USER_AGENT };
