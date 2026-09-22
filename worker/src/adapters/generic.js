const BaseAdapter = require('./base');
const { fetchPublic, normalizePublicHttpUrl, PublicHttpError } = require('../../../shared/publicHttp');
const { assertRobotsAllowed, USER_AGENT } = require('../security/robots');
const { extractImages } = require('../extractorBridge');

class GenericAdapter extends BaseAdapter {
  constructor() { super('generic'); }

  async crawl(_page, task) {
    const response = await fetchPublic(task.target_url, {
      timeoutMs: Math.min(60000, (task.page_timeout_seconds || 30) * 1000),
      maxBytes: 2 * 1024 * 1024,
      userAgent: USER_AGENT,
      beforeRequest: assertRobotsAllowed,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new PublicHttpError('HTTP_STATUS', 'Public page returned HTTP ' + response.status, {
        statusCode: response.status,
        retryAfter: response.headers['retry-after'],
      });
    }
    const contentType = String(response.headers['content-type'] || '').split(';')[0].trim();
    if (!['text/html', 'application/xhtml+xml'].includes(contentType)) {
      throw new PublicHttpError('CONTENT_TYPE', 'Public page did not return HTML');
    }
    const result = await extractImages({
      html: response.body.toString('utf8'), url: response.url,
      max_items: task.max_images || 1000, source_name: 'generic_html',
    });
    const images = [];
    for (const asset of result.images) {
      try {
        images.push({
          ...asset,
          image_url: normalizePublicHttpUrl(asset.normalized_image_url),
          source_page_url: response.url,
        });
      } catch {
        // Invalid/private metadata is never promoted into a downloadable asset.
      }
    }
    return { images, new_tasks: [] };
  }
}
module.exports = GenericAdapter;
