const BaseAdapter = require('./base');

class PinterestAdapter extends BaseAdapter {
  constructor() {
    super('pinterest');
  }

  async crawl(page, task) {
    const timeout = (task.page_timeout_seconds || 60) * 1000;

    console.log(`[Pinterest] 开始采集: ${task.target_url} (type=${task.task_type})`);

    await page.goto(task.target_url, {
      waitUntil: 'networkidle',
      timeout
    });

    const url = task.target_url || '';
    const isDetailUrl = /\/pin\/\d+/i.test(url);

    if (task.task_type === 'detail' || isDetailUrl) {
      console.log(`[Pinterest] 识别为详情页，使用详情页逻辑`);
      return this.crawlDetail(page, task);
    }

    console.log(`[Pinterest] 识别为列表页，使用列表页逻辑`);
    return this.crawlListing(page, task);
  }

  async crawlListing(page, task) {
    try {
      await page.waitForSelector('[data-test-id="pin"], [role="listitem"]', { timeout: 15000 });
    } catch {
      console.log(`[Pinterest] 列表页未找到pin元素`);
    }

    if (task.auto_scroll_seconds > 0) {
      await this.scrollPage(page, task.auto_scroll_seconds, task.auto_scroll_max_rounds || 10);
    }

    const rawPins = await page.evaluate(() => {
      function parseCount(text) {
        if (!text) return 0;
        text = text.trim().toLowerCase().replace(/,/g, '');
        if (text.includes('k')) return Math.round(parseFloat(text) * 1000);
        if (text.includes('m')) return Math.round(parseFloat(text) * 1000000);
        const num = parseInt(text);
        return isNaN(num) ? 0 : num;
      }

      const pins = Array.from(document.querySelectorAll('[data-test-id="pin"], [role="listitem"]'));
      return pins.map(pin => {
        const img = pin.querySelector('img');
        const link = pin.querySelector('a');
        const src = img ? (img.src || img.dataset.src || '') : '';
        const href = link ? link.href : '';

        let highRes = src;
        if (src.includes('236x')) highRes = src.replace('236x', 'originals');
        else if (src.includes('474x')) highRes = src.replace('474x', 'originals');

        let like_count = 0;
        let comment_count = 0;
        let favorite_count = 0;

        const countEls = pin.querySelectorAll('[data-test-id*="count"], [data-test-id*="reaction"], span');
        for (const el of countEls) {
          const text = el.textContent.trim();
          if (/^\d[\d,.]*[kmKM]?$/.test(text)) {
            const count = parseCount(text);
            const parent = el.parentElement;
            const nearby = parent ? parent.textContent.toLowerCase() : '';
            const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
            const combined = nearby + ' ' + ariaLabel;

            if (/save|repin|收藏|保存/.test(combined)) {
              favorite_count = Math.max(favorite_count, count);
            } else if (/comment|评论/.test(combined)) {
              comment_count = Math.max(comment_count, count);
            } else if (/like|react|赞|love/.test(combined)) {
              like_count = Math.max(like_count, count);
            } else if (count > 0 && like_count === 0) {
              like_count = count;
            }
          }
        }

        return {
          image_url: highRes || src,
          detail_page_url: href && href.includes('/pin/') ? href : null,
          source_page_url: window.location.href,
          width: img ? img.naturalWidth : null,
          height: img ? img.naturalHeight : null,
          like_count,
          favorite_count,
          comment_count,
          share_count: 0,
        };
      }).filter(p => p.image_url && p.image_url.startsWith('http'));
    });

    console.log(`[Pinterest] 列表页提取到 ${rawPins.length} 张图片`);
    const images = rawPins.map(p => this.normalizeImage(p));
    return { images, new_tasks: [] };
  }

  async crawlDetail(page, task) {
    console.log(`[Pinterest] 等待详情页加载...`);

    await page.waitForTimeout(3000);

    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        allImgCount: document.querySelectorAll('img').length,
        pinimgCount: document.querySelectorAll('img[src*="pinimg.com"]').length,
        allImgSrcs: Array.from(document.querySelectorAll('img')).slice(0, 10).map(i => i.src.substring(0, 80)),
        bodyText: document.body ? document.body.innerText.substring(0, 500) : 'no body',
      };
    });
    console.log(`[Pinterest] 页面信息: title="${pageInfo.title}" url=${pageInfo.url}`);
    console.log(`[Pinterest] 图片数量: 全部img=${pageInfo.allImgCount} pinimg=${pageInfo.pinimgCount}`);
    console.log(`[Pinterest] 前10个img src:`, pageInfo.allImgSrcs);

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
        _debug: {},
      };

      const allImages = Array.from(document.querySelectorAll('img'));
      let bestImg = null;
      let maxArea = 0;

      for (const img of allImages) {
        const src = img.src || '';
        if (!src.includes('pinimg.com')) continue;
        if (src.includes('75x75') || src.includes('30x30') || src.includes('140x140')) continue;

        const w = img.naturalWidth || img.width || 0;
        const h = img.naturalHeight || img.height || 0;
        const area = w * h;
        if (area > maxArea) {
          maxArea = area;
          bestImg = img;
        }
      }

      if (!bestImg && allImages.length > 0) {
        for (const img of allImages) {
          const src = img.src || '';
          if (!src || src.startsWith('data:')) continue;
          const w = img.naturalWidth || img.width || 0;
          const h = img.naturalHeight || img.height || 0;
          const area = w * h;
          if (area > maxArea) {
            maxArea = area;
            bestImg = img;
          }
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
        result._debug.bestImgSrc = src.substring(0, 100);
        result._debug.bestImgSize = `${bestImg.naturalWidth}x${bestImg.naturalHeight}`;
      }

      function parseCount(text) {
        if (!text) return 0;
        text = text.trim().toLowerCase().replace(/,/g, '');
        if (text.includes('k')) return Math.round(parseFloat(text) * 1000);
        if (text.includes('m')) return Math.round(parseFloat(text) * 1000000);
        const num = parseInt(text);
        return isNaN(num) ? 0 : num;
      }

      const allButtons = document.querySelectorAll('button, [role="button"]');
      for (const btn of allButtons) {
        const text = btn.textContent || '';
        const ariaLabel = btn.getAttribute('aria-label') || '';
        const combined = (text + ' ' + ariaLabel).toLowerCase();

        const nums = combined.match(/(\d[\d,.]*[kmKM]?)/g);
        if (!nums) continue;

        for (const numStr of nums) {
          const count = parseCount(numStr);
          if (/save|repin|收藏|保存/.test(combined)) {
            result.favorite_count = Math.max(result.favorite_count, count);
          } else if (/comment|评论/.test(combined)) {
            result.comment_count = Math.max(result.comment_count, count);
          } else if (/like|react|赞|love|喜欢/.test(combined)) {
            result.like_count = Math.max(result.like_count, count);
          }
        }
      }

      const countElements = document.querySelectorAll('[data-test-id] span, [class*="count"], [class*="Count"]');
      for (const el of countElements) {
        const text = el.textContent.trim();
        const parent = el.closest('[data-test-id]');
        const testId = parent ? parent.getAttribute('data-test-id') : '';

        if (/^\d[\d,.]*[kmKM]?$/.test(text)) {
          const count = parseCount(text);
          if (testId.includes('save') || testId.includes('repin')) {
            result.favorite_count = Math.max(result.favorite_count, count);
          }
          if (testId.includes('reaction') || testId.includes('like')) {
            result.like_count = Math.max(result.like_count, count);
          }
          if (testId.includes('comment')) {
            result.comment_count = Math.max(result.comment_count, count);
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
        const authorEl = document.querySelector('[data-test-id="pin-creator-name"], [data-test-id="creator-name"]');
        if (authorEl) {
          result.author_name = authorEl.textContent.trim();
          result.author_url = authorEl.href || null;
        }
      }

      return result;
    });

    console.log(`[Pinterest] 详情页提取结果: image_url=${pinData.image_url ? pinData.image_url.substring(0, 60) + '...' : 'NULL'}`);
    console.log(`[Pinterest] 数据: like=${pinData.like_count} fav=${pinData.favorite_count} comment=${pinData.comment_count}`);
    if (pinData._debug) {
      console.log(`[Pinterest] 调试: bestImg=${pinData._debug.bestImgSrc || 'none'} size=${pinData._debug.bestImgSize || 'none'}`);
    }

    if (!pinData.image_url) {
      console.log(`[Pinterest] 未找到图片，返回空结果`);
      return { images: [], new_tasks: [] };
    }

    delete pinData._debug;
    const images = [this.normalizeImage(pinData)];
    console.log(`[Pinterest] 成功提取 1 张图片`);
    return { images, new_tasks: [] };
  }
}

module.exports = PinterestAdapter;
