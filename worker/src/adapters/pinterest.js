const BaseAdapter = require('./base');

class PinterestAdapter extends BaseAdapter {
  constructor() {
    super('pinterest');
  }

  async crawl(page, task) {
    const timeout = (task.page_timeout_seconds || 60) * 1000;

    await page.goto(task.target_url, {
      waitUntil: 'domcontentloaded',
      timeout
    });

    // 等待图片加载
    try {
      await page.waitForSelector('[data-test-id="pin"]', { timeout: 10000 });
    } catch {}

    if (task.auto_scroll_seconds > 0) {
      await this.scrollPage(page, task.auto_scroll_seconds, task.auto_scroll_max_rounds || 10);
    }

    const rawPins = await page.evaluate(() => {
      const pins = Array.from(document.querySelectorAll('[data-test-id="pin"], [role="listitem"]'));
      return pins.map(pin => {
        const img = pin.querySelector('img');
        const link = pin.querySelector('a');
        const src = img ? (img.src || img.dataset.src || '') : '';
        const href = link ? link.href : '';

        // Try to extract high-res URL
        let highRes = src;
        if (src.includes('236x')) highRes = src.replace('236x', 'originals');
        else if (src.includes('474x')) highRes = src.replace('474x', 'originals');

        return {
          image_url: highRes || src,
          detail_page_url: href && href.includes('/pin/') ? href : null,
          source_page_url: window.location.href,
          width: img ? img.naturalWidth : null,
          height: img ? img.naturalHeight : null,
        };
      }).filter(p => p.image_url && p.image_url.startsWith('http'));
    });

    const images = rawPins.map(p => this.normalizeImage(p));

    // Generate detail tasks for pins with detail URLs
    const new_tasks = task.task_type === 'seed'
      ? rawPins
        .filter(p => p.detail_page_url)
        .map(p => ({ target_url: p.detail_page_url, task_type: 'detail', priority: 5 }))
      : [];

    return { images, new_tasks };
  }
}

module.exports = PinterestAdapter;
