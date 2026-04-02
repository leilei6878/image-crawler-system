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

    if (task.task_type === 'detail') {
      return this.crawlDetail(page, task);
    }

    return this.crawlListing(page, task);
  }

  async crawlListing(page, task) {
    try {
      await page.waitForSelector('[data-test-id="pin"], [role="listitem"]', { timeout: 15000 });
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

    const new_tasks = rawPins
      .filter(p => p.detail_page_url)
      .map(p => ({ target_url: p.detail_page_url, task_type: 'detail', priority: 5 }));

    return { images: [], new_tasks };
  }

  async crawlDetail(page, task) {
    try {
      await page.waitForSelector('img[src*="pinimg.com"]', { timeout: 15000 });
    } catch {}

    await page.waitForTimeout(2000);

    const pinData = await page.evaluate(() => {
      const result = {
        image_url: null,
        detail_page_url: window.location.href,
        source_page_url: window.location.href,
        author_name: null,
        author_url: null,
        width: null,
        height: null,
        like_count: 0,
        favorite_count: 0,
        comment_count: 0,
        share_count: 0,
      };

      const images = Array.from(document.querySelectorAll('img[src*="pinimg.com"]'));
      let bestImg = null;
      let maxArea = 0;
      for (const img of images) {
        const area = (img.naturalWidth || img.width || 0) * (img.naturalHeight || img.height || 0);
        if (area > maxArea) {
          maxArea = area;
          bestImg = img;
        }
      }
      if (bestImg) {
        let src = bestImg.src || '';
        if (src.includes('236x')) src = src.replace('236x', 'originals');
        else if (src.includes('474x')) src = src.replace('474x', 'originals');
        else if (src.includes('564x')) src = src.replace('564x', 'originals');
        result.image_url = src;
        result.width = bestImg.naturalWidth || null;
        result.height = bestImg.naturalHeight || null;
      }

      function parseCount(text) {
        if (!text) return 0;
        text = text.trim().toLowerCase().replace(/,/g, '');
        if (text.includes('k')) return Math.round(parseFloat(text) * 1000);
        if (text.includes('m')) return Math.round(parseFloat(text) * 1000000);
        const num = parseInt(text);
        return isNaN(num) ? 0 : num;
      }

      const allText = document.body.innerText || '';

      const reactionBtns = document.querySelectorAll('[data-test-id="reaction-count"], [data-test-id="repin-count"], [data-test-id="save-count"]');
      reactionBtns.forEach(el => {
        const count = parseCount(el.textContent);
        if (count > 0) result.like_count = Math.max(result.like_count, count);
      });

      const allButtons = document.querySelectorAll('button, [role="button"]');
      for (const btn of allButtons) {
        const text = btn.textContent || '';
        const ariaLabel = btn.getAttribute('aria-label') || '';

        const saveMatch = ariaLabel.match(/(\d[\d,.]*[kmKM]?)\s*(save|保存|收藏)/i) || text.match(/(\d[\d,.]*[kmKM]?)\s*(save|保存|收藏)/i);
        if (saveMatch) {
          result.favorite_count = Math.max(result.favorite_count, parseCount(saveMatch[1]));
        }

        const likeMatch = ariaLabel.match(/(\d[\d,.]*[kmKM]?)\s*(like|react|赞|喜欢)/i) || text.match(/(\d[\d,.]*[kmKM]?)\s*(like|react|赞|喜欢)/i);
        if (likeMatch) {
          result.like_count = Math.max(result.like_count, parseCount(likeMatch[1]));
        }

        const commentMatch = ariaLabel.match(/(\d[\d,.]*[kmKM]?)\s*(comment|评论)/i) || text.match(/(\d[\d,.]*[kmKM]?)\s*(comment|评论)/i);
        if (commentMatch) {
          result.comment_count = Math.max(result.comment_count, parseCount(commentMatch[1]));
        }
      }

      const countElements = document.querySelectorAll('[data-test-id] span, [class*="count"], [class*="Count"]');
      for (const el of countElements) {
        const text = el.textContent.trim();
        const parent = el.closest('[data-test-id]');
        const testId = parent ? parent.getAttribute('data-test-id') : '';

        if (testId.includes('save') || testId.includes('repin')) {
          const count = parseCount(text);
          if (count > 0) result.favorite_count = Math.max(result.favorite_count, count);
        }
        if (testId.includes('reaction') || testId.includes('like')) {
          const count = parseCount(text);
          if (count > 0) result.like_count = Math.max(result.like_count, count);
        }
        if (testId.includes('comment')) {
          const count = parseCount(text);
          if (count > 0) result.comment_count = Math.max(result.comment_count, count);
        }
      }

      const numberSpans = document.querySelectorAll('span');
      for (const span of numberSpans) {
        const text = span.textContent.trim();
        if (/^\d[\d,.]*[kmKM]?$/.test(text)) {
          const count = parseCount(text);
          const nearby = span.parentElement ? span.parentElement.textContent : '';
          if (/comment|评论/i.test(nearby)) {
            result.comment_count = Math.max(result.comment_count, count);
          } else if (/save|保存|收藏|repin/i.test(nearby)) {
            result.favorite_count = Math.max(result.favorite_count, count);
          } else if (/react|like|赞|喜欢|love/i.test(nearby)) {
            result.like_count = Math.max(result.like_count, count);
          }
        }
      }

      const scriptTags = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scriptTags) {
        try {
          const data = JSON.parse(script.textContent);
          if (data.interactionStatistic) {
            const stats = Array.isArray(data.interactionStatistic) ? data.interactionStatistic : [data.interactionStatistic];
            for (const stat of stats) {
              const type = (stat.interactionType || '').toLowerCase();
              const count = parseInt(stat.userInteractionCount) || 0;
              if (type.includes('like')) result.like_count = Math.max(result.like_count, count);
              if (type.includes('save') || type.includes('pin')) result.favorite_count = Math.max(result.favorite_count, count);
              if (type.includes('comment')) result.comment_count = Math.max(result.comment_count, count);
            }
          }
          if (data.author) {
            result.author_name = data.author.name || null;
            result.author_url = data.author.url || null;
          }
        } catch {}
      }

      if (!result.author_name) {
        const authorEl = document.querySelector('[data-test-id="pin-creator-name"], [data-test-id="creator-name"], a[href*="/user/"], a[href*="/pin-creator/"]');
        if (authorEl) {
          result.author_name = authorEl.textContent.trim();
          result.author_url = authorEl.href || null;
        }
      }

      return result;
    });

    if (!pinData.image_url) {
      return { images: [], new_tasks: [] };
    }

    const images = [this.normalizeImage(pinData)];
    return { images, new_tasks: [] };
  }
}

module.exports = PinterestAdapter;
