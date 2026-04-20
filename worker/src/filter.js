function parsePositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function passesMinThreshold(rawValue, rawThreshold) {
  const threshold = parsePositiveInt(rawThreshold);
  if (threshold === null || threshold <= 0) {
    return true;
  }

  const value = parsePositiveInt(rawValue);
  if (value === null) {
    return false;
  }

  return value >= threshold;
}

function passesFilter(img, filter) {
  if (!filter) return true;
  const mode = filter.logic_mode || 'and';

  if (filter.exclude_video) {
    const url = (img.image_url || '').toLowerCase();
    if (url.endsWith('.mp4') || url.endsWith('.webm') || url.endsWith('.mov') || url.includes('video')) {
      return false;
    }
  }

  if (filter.exclude_collage) {
    const url = (img.image_url || '').toLowerCase();
    if (url.includes('collage') || url.includes('grid')) {
      return false;
    }
  }

  const checks = [];
  checks.push(passesMinThreshold(img.like_count, filter.min_like));
  checks.push(passesMinThreshold(img.favorite_count, filter.min_favorite));
  checks.push(passesMinThreshold(img.comment_count, filter.min_comment));
  checks.push(passesMinThreshold(img.share_count, filter.min_share));
  checks.push(passesMinThreshold(img.width, filter.min_width));
  checks.push(passesMinThreshold(img.height, filter.min_height));

  if (mode === 'or') {
    return checks.some(check => check);
  }
  return checks.every(check => check);
}

module.exports = {
  parsePositiveInt,
  passesMinThreshold,
  passesFilter,
};
