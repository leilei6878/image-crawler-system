const BaseAdapter = require('./base');

class GenericAdapter extends BaseAdapter {
  constructor() {
    super('generic');
  }

  async crawl(page, task) {
    const timeout = (task.page_timeout_seconds || 60) * 1000;

    await page.goto(task.target_url, {
      waitUntil: 'networkidle',
      timeout
    });

    if (task.auto_scroll_seconds > 0) {
      await this.scrollPage(page, task.auto_scroll_seconds, task.auto_scroll_max_rounds || 10);
    }

    const rawImages = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      return imgs
        .filter(img => img.naturalWidth > 200 && img.naturalHeight > 200)
        .map(img => ({
          image_url: img.src,
          source_page_url: window.location.href,
          width: img.naturalWidth || null,
          height: img.naturalHeight || null,
        }));
    });

    const images = rawImages
      .filter(img => img.image_url && img.image_url.startsWith('http'))
      .map(img => this.normalizeImage(img));

    return { images, new_tasks: [] };
  }
}

module.exports = GenericAdapter;
