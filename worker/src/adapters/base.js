class BaseAdapter {
  constructor(siteType) {
    this.siteType = siteType;
  }

  async crawl(page, task) {
    throw new Error('BaseAdapter.crawl() must be overridden');
  }

  async scrollPage(page, seconds = 30, maxRounds = 10) {
    const totalMs = Math.max(0, Number(seconds || 0) * 1000);
    const totalRounds = Math.max(0, Number(maxRounds || 0));
    if (totalMs <= 0 || totalRounds <= 0) {
      return {
        executedRounds: 0,
        changedRounds: 0,
        stoppedReason: 'disabled',
      };
    }

    const startedAt = Date.now();
    const targetRoundMs = Math.max(1200, Math.floor(totalMs / totalRounds));

    let lastHeight = await page.evaluate(() => document.body.scrollHeight);
    let noChangeCount = 0;
    let executedRounds = 0;
    let changedRounds = 0;
    let stoppedReason = 'completed';

    for (let round = 0; round < totalRounds; round++) {
      executedRounds++;

      await page.evaluate(() => {
        const nextY = window.scrollY + Math.max(window.innerHeight * 0.9, 1200);
        window.scrollTo(0, nextY);
      });
      await page.mouse.wheel(0, 2200).catch(() => {});
      await page.waitForTimeout(intervalMs);

      const newHeight = await page.evaluate(() => document.body.scrollHeight);
      if (newHeight === lastHeight) {
        noChangeCount++;
        if (noChangeCount >= 5) {
          stoppedReason = 'height_stable';
          break;
        }
      } else {
        noChangeCount = 0;
        changedRounds++;
      }
      lastHeight = newHeight;

      const expectedElapsedMs = Math.min(totalMs, (round + 1) * targetRoundMs);
      const waitMs = startedAt + expectedElapsedMs - Date.now();
      if (waitMs > 0) {
        await page.waitForTimeout(waitMs);
      }
    }

    return {
      executedRounds,
      changedRounds,
      stoppedReason,
      finalHeight: lastHeight,
    };
  }

  normalizeImage(raw) {
    return {
      image_url: raw.image_url || raw.src || '',
      detail_page_url: raw.detail_page_url || raw.href || null,
      source_page_url: raw.source_page_url || null,
      author_name: raw.author_name || raw.author || null,
      author_url: raw.author_url || null,
      width: raw.width ?? null,
      height: raw.height ?? null,
      like_count: raw.like_count ?? null,
      favorite_count: raw.favorite_count ?? null,
      comment_count: raw.comment_count ?? null,
      share_count: raw.share_count ?? null,
    };
  }
}

module.exports = BaseAdapter;
