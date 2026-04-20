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

    let lastHeight = await page.evaluate(() => document.body.scrollHeight);
    let noChangeCount = 0;

    for (let round = 0; round < totalRounds; round++) {
      await page.evaluate(() => {
        const nextY = window.scrollY + Math.max(window.innerHeight, 1200);
        window.scrollTo({ top: nextY, behavior: 'instant' });
      });
      await page.mouse.wheel(0, 1600).catch(() => {});
      await page.waitForTimeout(intervalMs);

      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === lastHeight) {
        noChangeCount++;
        if (noChangeCount >= 5) break;
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
