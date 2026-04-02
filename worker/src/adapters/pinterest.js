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
      console.log(`[Pinterest] 识别为Pin页面，提取主图+滚动加载更多图片`);
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
      console.log(`[Pinterest] 开始滚动加载: ${task.auto_scroll_seconds}秒 / 最多${task.auto_scroll_max_rounds || 10}轮`);
      await this.scrollPage(page, task.auto_scroll_seconds, task.auto_scroll_max_rounds || 10);
    }

    const rawPins = await this.extractAllPins(page);
    console.log(`[Pinterest] 列表页提取到 ${rawPins.length} 张图片`);
    const images = rawPins.map(p => this.normalizeImage(p));
    return { images, new_tasks: [] };
  }

  async crawlDetail(page, task) {
    console.log(`[Pinterest] 等待页面内容加载...`);

    try {
      await page.waitForSelector('img[src*="pinimg.com"]', { timeout: 15000 });
    } catch {
      console.log(`[Pinterest] 未检测到pinimg图片`);
    }

    await page.waitForTimeout(2000);

    const beforeScrollCount = await page.evaluate(() => document.querySelectorAll('img[src*="pinimg.com"]').length);
    console.log(`[Pinterest] 滚动前图片数: ${beforeScrollCount}`);

    if (task.auto_scroll_seconds > 0) {
      console.log(`[Pinterest] 开始滚动加载更多推荐图片: ${task.auto_scroll_seconds}秒 / 最多${task.auto_scroll_max_rounds || 10}轮`);
      await this.scrollPage(page, task.auto_scroll_seconds, task.auto_scroll_max_rounds || 10);
    }

    const afterScrollCount = await page.evaluate(() => document.querySelectorAll('img[src*="pinimg.com"]').length);
    console.log(`[Pinterest] 滚动后图片数: ${afterScrollCount}`);

    const rawPins = await this.extractAllPins(page);
    console.log(`[Pinterest] Pin页面提取到 ${rawPins.length} 张图片`);

    const images = rawPins.map(p => this.normalizeImage(p));
    return { images, new_tasks: [] };
  }

  async extractAllPins(page) {
    return await page.evaluate(() => {
      function parseCount(text) {
        if (!text) return 0;
        text = text.trim().toLowerCase().replace(/,/g, '');
        if (text.includes('k')) return Math.round(parseFloat(text) * 1000);
        if (text.includes('m')) return Math.round(parseFloat(text) * 1000000);
        const num = parseInt(text);
        return isNaN(num) ? 0 : num;
      }

      const seenUrls = new Set();
      const results = [];

      const pinContainers = document.querySelectorAll('[data-test-id="pin"], [role="listitem"]');

      if (pinContainers.length > 0) {
        for (const pin of pinContainers) {
          const img = pin.querySelector('img');
          const link = pin.querySelector('a[href*="/pin/"]');
          if (!img) continue;

          const src = img.src || img.dataset.src || '';
          if (!src || !src.startsWith('http')) continue;

          let highRes = src;
          if (src.includes('236x')) highRes = src.replace('236x', 'originals');
          else if (src.includes('474x')) highRes = src.replace('474x', 'originals');
          else if (src.includes('564x')) highRes = src.replace('564x', 'originals');

          if (seenUrls.has(highRes)) continue;
          seenUrls.add(highRes);

          let like_count = 0;
          let comment_count = 0;
          let favorite_count = 0;

          const countEls = pin.querySelectorAll('[data-test-id*="count"], [data-test-id*="reaction"], span');
          for (const el of countEls) {
            const text = el.textContent.trim();
            if (/^\d[\d,.]*[kmKM]?$/.test(text)) {
              const count = parseCount(text);
              if (count > 10000000) continue;
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

          results.push({
            image_url: highRes,
            detail_page_url: link ? link.href : null,
            source_page_url: window.location.href,
            width: img.naturalWidth || null,
            height: img.naturalHeight || null,
            like_count,
            favorite_count,
            comment_count,
            share_count: 0,
          });
        }
      }

      if (results.length === 0) {
        const allImages = document.querySelectorAll('img[src*="pinimg.com"]');
        for (const img of allImages) {
          const src = img.src || '';
          if (src.includes('75x75') || src.includes('30x30') || src.includes('140x140')) continue;
          if (src.includes('avatar') || src.includes('user/')) continue;

          let highRes = src;
          if (src.includes('236x')) highRes = src.replace('236x', 'originals');
          else if (src.includes('474x')) highRes = src.replace('474x', 'originals');
          else if (src.includes('564x')) highRes = src.replace('564x', 'originals');

          if (seenUrls.has(highRes)) continue;
          seenUrls.add(highRes);

          const link = img.closest('a[href*="/pin/"]') || img.parentElement?.closest('a[href*="/pin/"]');

          results.push({
            image_url: highRes,
            detail_page_url: link ? link.href : null,
            source_page_url: window.location.href,
            width: img.naturalWidth || null,
            height: img.naturalHeight || null,
            like_count: 0,
            favorite_count: 0,
            comment_count: 0,
            share_count: 0,
          });
        }
      }

      return results;
    });
  }
}

module.exports = PinterestAdapter;
