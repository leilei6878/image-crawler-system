class BaseAdapter {
  constructor(siteType) {
    this.siteType = siteType;
  }

  async crawl(page, task) {
    throw new Error('BaseAdapter.crawl() must be overridden');
  }

  async scrollPage(page, seconds = 30, maxRounds = 10) {
    const intervalMs = 2000;
    const totalRounds = Math.min(Math.ceil(seconds * 1000 / intervalMs), maxRounds);

    let lastHeight = 0;
    let noChangeCount = 0;

    for (let round = 0; round < totalRounds; round++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(intervalMs);

      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === lastHeight) {
        noChangeCount++;
        if (noChangeCount >= 3) break;
      } else {
        noChangeCount = 0;
      }
      lastHeight = newHeight;
    }
  }

  normalizeImage(raw) {
    return {
      image_url: raw.image_url || raw.src || '',
      detail_page_url: raw.detail_page_url || raw.href || null,
      source_page_url: raw.source_page_url || null,
      author_name: raw.author_name || raw.author || null,
      author_url: raw.author_url || null,
      width: raw.width || null,
      height: raw.height || null,
      like_count: raw.like_count || null,
      favorite_count: raw.favorite_count || null,
      comment_count: raw.comment_count || null,
      share_count: raw.share_count || null,
    };
  }
}

module.exports = BaseAdapter;
