const BaseAdapter = require('./base');
const fs = require('fs');
const path = require('path');

class PinterestAdapter extends BaseAdapter {
  constructor() {
    super('pinterest');
  }

  async loadCookies(context) {
    const cookiePaths = [
      path.join(process.cwd(), 'cookies', 'pinterest.json'),
      path.join(process.cwd(), 'pinterest_cookies.json'),
    ];

    for (const cookiePath of cookiePaths) {
      try {
        if (fs.existsSync(cookiePath)) {
          const raw = fs.readFileSync(cookiePath, 'utf8');
          const cookies = JSON.parse(raw);
          if (Array.isArray(cookies) && cookies.length > 0) {
            await context.addCookies(cookies);
            console.log(`[Pinterest] 已加载Cookie: ${cookiePath} (${cookies.length}条)`);
            return true;
          }
        }
      } catch (err) {
        console.log(`[Pinterest] 加载Cookie失败: ${cookiePath} - ${err.message}`);
      }
    }
    console.log(`[Pinterest] 未找到Cookie文件，以游客模式采集`);
    return false;
  }

  async crawl(page, task) {
    const timeout = (task.page_timeout_seconds || 60) * 1000;

    console.log(`[Pinterest] 开始采集: ${task.target_url} (type=${task.task_type})`);

    await this.loadCookies(page.context());

    await page.goto(task.target_url, {
      waitUntil: 'domcontentloaded',
      timeout
    });

    await page.waitForTimeout(5000);

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
      await page.waitForSelector('[data-test-id="pin"], [role="listitem"], img[src*="pinimg.com"]', { timeout: 15000 });
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
    console.log(`[Pinterest] 等待详情页内容加载...`);

    try {
      await page.waitForSelector('img[src*="pinimg.com"]', { timeout: 15000 });
    } catch {
      console.log(`[Pinterest] 未检测到pinimg图片，尝试等待任意图片...`);
      try {
        await page.waitForSelector('img', { timeout: 5000 });
      } catch {}
    }

    await page.waitForTimeout(2000);

    const pageInfo = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        allImgCount: document.querySelectorAll('img').length,
        pinimgCount: document.querySelectorAll('img[src*="pinimg.com"]').length,
      };
    });
    console.log(`[Pinterest] 页面: title="${pageInfo.title.substring(0, 60)}" img总数=${pageInfo.allImgCount} pinimg=${pageInfo.pinimgCount}`);

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

      if (!bestImg) {
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
      }

      function parseCount(text) {
        if (!text) return 0;
        text = text.trim().toLowerCase().replace(/,/g, '');
        if (text.includes('k')) return Math.round(parseFloat(text) * 1000);
        if (text.includes('m')) return Math.round(parseFloat(text) * 1000000);
        const num = parseInt(text);
        return isNaN(num) ? 0 : num;
      }

      const scriptTags = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scriptTags) {
        try {
          const data = JSON.parse(script.textContent);
          if (data.interactionStatistic) {
            const stats = Array.isArray(data.interactionStatistic) ? data.interactionStatistic : [data.interactionStatistic];
            for (const stat of stats) {
              const typeUrl = stat.interactionType || '';
              const typeName = typeof typeUrl === 'string' ? typeUrl : (typeUrl['@type'] || '');
              const count = parseInt(stat.userInteractionCount) || 0;
              if (/like/i.test(typeName)) result.like_count = Math.max(result.like_count, count);
              if (/save|pin|bookmark/i.test(typeName)) result.favorite_count = Math.max(result.favorite_count, count);
              if (/comment/i.test(typeName)) result.comment_count = Math.max(result.comment_count, count);
            }
          }
          if (data.author) {
            result.author_name = data.author.name || null;
            result.author_url = data.author.url || null;
          }
        } catch {}
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
          if (count > 10000000) continue;
          if (/save|repin|收藏|保存/.test(combined)) {
            result.favorite_count = Math.max(result.favorite_count, count);
          } else if (/comment|评论/.test(combined)) {
            result.comment_count = Math.max(result.comment_count, count);
          } else if (/like|react|赞|love|喜欢/.test(combined)) {
            result.like_count = Math.max(result.like_count, count);
          }
        }
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

    console.log(`[Pinterest] 提取结果: image=${pinData.image_url ? 'YES' : 'NULL'} like=${pinData.like_count} fav=${pinData.favorite_count} comment=${pinData.comment_count} author=${pinData.author_name || 'unknown'}`);

    if (!pinData.image_url) {
      console.log(`[Pinterest] 未找到图片，返回空结果`);
      return { images: [], new_tasks: [] };
    }

    const images = [this.normalizeImage(pinData)];
    console.log(`[Pinterest] 成功提取 1 张图片`);
    return { images, new_tasks: [] };
  }
}

module.exports = PinterestAdapter;
