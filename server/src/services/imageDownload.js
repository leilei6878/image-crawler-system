const { fetchPublic, PublicHttpError } = require('../../../shared/publicHttp');

const types = new Map([
  ['image/jpeg', '.jpg'], ['image/png', '.png'], ['image/webp', '.webp'],
  ['image/gif', '.gif'], ['image/avif', '.avif'],
]);

async function fetchImageWithLimits(url, options) {
  const response = await fetchPublic(url, options);
  if (response.status < 200 || response.status >= 300) {
    throw new PublicHttpError('HTTP_STATUS', 'Image download returned HTTP ' + response.status);
  }
  const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!types.has(contentType)) throw new PublicHttpError('CONTENT_TYPE', 'Unsupported image content type');
  return {
    buffer: response.body, contentType, size: response.body.length,
    extension: types.get(contentType), finalUrl: response.url,
  };
}
module.exports = { fetchImageWithLimits };
