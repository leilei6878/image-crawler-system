const BaseAdapter = require('./base');
const fs = require('fs');
const path = require('path');

const PINTEREST_REQUIRE_LOGIN = process.env.PINTEREST_REQUIRE_LOGIN !== 'false';

class PinterestAdapter extends BaseAdapter {
  constructor() {
    super('pinterest');
  }

  requiresEngagementDetails(task) {
    const filters = task && task.filters;
    if (!filters) return false;

    return [
      filters.min_like,
      filters.min_favorite,
      filters.min_comment,
      filters.min_share,
    ].some(value => parseInt(value, 10) > 0);
  }

  getAuthFileCandidates() {
    const cookiePaths = [
      process.env.PINTEREST_COOKIE_PATH,
      path.join(process.cwd(), 'cookies', 'pinterest.json'),
      path.join(process.cwd(), 'cookies', 'pinterest-cookies.json'),
      path.join(process.cwd(), 'pinterest_cookies.json'),
    ].filter(Boolean);

    const storageStatePaths = [
      process.env.PINTEREST_STORAGE_STATE_PATH,
      path.join(process.cwd(), 'cookies', 'pinterest-storage-state.json'),
      path.join(process.cwd(), 'pinterest_storage_state.json'),
    ].filter(Boolean);

    return { cookiePaths, storageStatePaths };
  }

  async loadAuthState(context) {
    const { cookiePaths, storageStatePaths } = this.getAuthFileCandidates();

    for (const storagePath of storageStatePaths) {
      try {
        if (!fs.existsSync(storagePath)) continue;

        const raw = fs.readFileSync(storagePath, 'utf8');
        const storageState = JSON.parse(raw);
        if (Array.isArray(storageState.cookies) && storageState.cookies.length > 0) {
          await context.addCookies(storageState.cookies);
          console.log(`[Pinterest] 已加载 storage state: ${storagePath} (${storageState.cookies.length} 条 cookies)`);
          return { loaded: true, source: storagePath, type: 'storage_state' };
        }
      } catch (err) {
        console.log(`[Pinterest] 加载 storage state 失败: ${storagePath} - ${err.message}`);
      }
    }

    for (const cookiePath of cookiePaths) {
      try {
        if (!fs.existsSync(cookiePath)) continue;

        const raw = fs.readFileSync(cookiePath, 'utf8');
        let cookies = JSON.parse(raw);
        if (!Array.isArray(cookies) || cookies.length === 0) continue;

        cookies = cookies
          .map(cookie => {
            const cleaned = {
              name: cookie.name,
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path || '/',
            };

            if (cookie.expires && cookie.expires > 0) cleaned.expires = cookie.expires;
            else if (cookie.expirationDate && cookie.expirationDate > 0) cleaned.expires = cookie.expirationDate;

            if (cookie.httpOnly !== undefined) cleaned.httpOnly = !!cookie.httpOnly;
            if (cookie.secure !== undefined) cleaned.secure = !!cookie.secure;

            const sameSite = String(cookie.sameSite || '');
            if (/^strict$/i.test(sameSite)) cleaned.sameSite = 'Strict';
            else if (/^lax$/i.test(sameSite)) cleaned.sameSite = 'Lax';
            else if (/^none$/i.test(sameSite) || /^no_restriction$/i.test(sameSite)) cleaned.sameSite = 'None';
            else cleaned.sameSite = 'Lax';

            return cleaned;
          })
          .filter(cookie => cookie.name && cookie.value && cookie.domain);

        if (cookies.length === 0) continue;

        await context.addCookies(cookies);
        console.log(`[Pinterest] 已加载 cookies: ${cookiePath} (${cookies.length} 条)`);
        return { loaded: true, source: cookiePath, type: 'cookies' };
      } catch (err) {
        console.log(`[Pinterest] 加载 cookies 失败: ${cookiePath} - ${err.message}`);
      }
    }

    const authHint = [
      process.env.PINTEREST_COOKIE_PATH ? `PINTEREST_COOKIE_PATH=${process.env.PINTEREST_COOKIE_PATH}` : null,
      process.env.PINTEREST_STORAGE_STATE_PATH ? `PINTEREST_STORAGE_STATE_PATH=${process.env.PINTEREST_STORAGE_STATE_PATH}` : null,
      'worker/cookies/pinterest.json',
      'worker/cookies/pinterest-storage-state.json',
    ].filter(Boolean).join(', ');

    if (PINTEREST_REQUIRE_LOGIN) {
      throw new Error(`Pinterest 登录态缺失。请提供 cookies/storage state 文件。可用路径: ${authHint}`);
    }

    console.log('[Pinterest] 未找到登录态文件，将以游客模式采集。');
    return { loaded: false, source: null, type: 'guest' };
  }

  async ensureAuthenticated(context, page, authState) {
    const cookies = await context.cookies('https://www.pinterest.com');
    const hasSessionCookie = cookies.some(cookie =>
      cookie.name === '_pinterest_sess' && cookie.value
    );

    const currentUrl = page.url();
    const loginWallDetected = await page.evaluate(() => {
      const pageText = document.body ? document.body.innerText.toLowerCase() : '';
      return (
        pageText.includes('log in') ||
        pageText.includes('sign up') ||
        pageText.includes('继续使用') ||
        pageText.includes('登录后继续')
      );
    }).catch(() => false);

    if (PINTEREST_REQUIRE_LOGIN && (!hasSessionCookie || /\/login/i.test(currentUrl) || loginWallDetected)) {
      const source = authState && authState.source ? authState.source : 'unknown';
      throw new Error(`Pinterest 登录态无效或已过期，请更新认证文件: ${source}`);
    }

    if (hasSessionCookie) {
      console.log('[Pinterest] 已检测到登录态，将按登录用户视角采集。');
    }
  }

  async crawl(page, task) {
    const timeout = (task.page_timeout_seconds || 60) * 1000;

    console.log(`[Pinterest] 开始采集: ${task.target_url} (type=${task.task_type})`);

    const authState = await this.loadAuthState(page.context());

    await page.goto(task.target_url, {
      waitUntil: 'domcontentloaded',
      timeout,
    });

    await page.waitForTimeout(5000);
    await this.ensureAuthenticated(page.context(), page, authState);

    const url = task.target_url || '';
    const isDetailUrl = /\/pin\/\d+/i.test(url);

    if (task.task_type === 'detail' || isDetailUrl) {
      console.log('[Pinterest] 识别为 Pin 页面，提取主图并尝试滚动加载更多图片');
      return this.crawlDetail(page, task);
    }

    console.log('[Pinterest] 识别为列表页，使用列表页逻辑');
    return this.crawlListing(page, task);
  }

  async crawlListing(page, task) {
    try {
      await page.waitForSelector('[data-test-id="pin"], [role="listitem"], img[src*="pinimg.com"]', { timeout: 15000 });
    } catch {
      console.log('[Pinterest] 列表页未找到 pin 元素');
    }

    if (task.auto_scroll_seconds > 0) {
      console.log(`[Pinterest] 开始滚动加载: ${task.auto_scroll_seconds} 秒 / 最多 ${task.auto_scroll_max_rounds || 10} 轮`);
      await this.scrollPage(page, task.auto_scroll_seconds, task.auto_scroll_max_rounds || 10);
    }

    const rawPins = await this.extractAllPins(page);
    console.log(`[Pinterest] 列表页提取到 ${rawPins.length} 张图片`);

    if (this.requiresEngagementDetails(task)) {
      const newTasks = rawPins
        .filter(pin => pin.detail_page_url)
        .map(pin => ({
          task_type: 'detail',
          target_url: pin.detail_page_url,
          priority: 5,
        }));

      console.log(`[Pinterest] 检测到互动指标筛选，列表页改为派发 ${newTasks.length} 个详情任务`);
      return { images: [], new_tasks: newTasks };
    }

    const images = rawPins.map(pin => this.normalizeImage(pin));
    return { images, new_tasks: [] };
  }

  async crawlDetail(page, task) {
    console.log('[Pinterest] 等待页面内容加载...');

    try {
      await page.waitForSelector('img[src*="pinimg.com"]', { timeout: 15000 });
    } catch {
      console.log('[Pinterest] 未检测到 pinimg 图片');
    }

    await page.waitForTimeout(2000);

    const beforeScrollCount = await page.evaluate(() => document.querySelectorAll('img[src*="pinimg.com"]').length);
    console.log(`[Pinterest] 滚动前图片数: ${beforeScrollCount}`);

    if (task.auto_scroll_seconds > 0) {
      console.log(`[Pinterest] 开始滚动加载更多推荐图片: ${task.auto_scroll_seconds} 秒 / 最多 ${task.auto_scroll_max_rounds || 10} 轮`);
      await this.scrollPage(page, task.auto_scroll_seconds, task.auto_scroll_max_rounds || 10);
    }

    const afterScrollCount = await page.evaluate(() => document.querySelectorAll('img[src*="pinimg.com"]').length);
    console.log(`[Pinterest] 滚动后图片数: ${afterScrollCount}`);

    const primaryPin = await this.extractPrimaryPin(page, task);
    const recommendationTasks = await this.extractRecommendationTasks(page, task.target_url);

    console.log(`[Pinterest] Pin 页面主图提取: ${primaryPin ? 1 : 0}，推荐详情任务: ${recommendationTasks.length}`);

    const images = primaryPin ? [this.normalizeImage(primaryPin)] : [];
    return { images, new_tasks: recommendationTasks };
  }

  async extractPrimaryPin(page, task) {
    return await page.evaluate((taskUrl) => {
      function parseCount(text) {
        if (!text) return 0;
        const normalized = text.trim().toLowerCase().replace(/,/g, '');
        if (normalized.includes('k')) return Math.round(parseFloat(normalized) * 1000);
        if (normalized.includes('m')) return Math.round(parseFloat(normalized) * 1000000);
        const num = parseInt(normalized, 10);
        return Number.isNaN(num) ? 0 : num;
      }

      function extractMetric(texts, keywords) {
        let max = 0;
        for (const text of texts) {
          const value = String(text || '').replace(/\s+/g, ' ').trim();
          if (!value) continue;

          for (const keyword of keywords) {
            const afterRegex = new RegExp(`(\\d[\\d,.]*[kKmM]?)\\s*${keyword}`, 'i');
            const beforeRegex = new RegExp(`${keyword}\\s*(\\d[\\d,.]*[kKmM]?)`, 'i');

            const afterMatch = value.match(afterRegex);
            if (afterMatch) max = Math.max(max, parseCount(afterMatch[1]));

            const beforeMatch = value.match(beforeRegex);
            if (beforeMatch) max = Math.max(max, parseCount(beforeMatch[1]));
          }
        }
        return max;
      }

      const candidates = Array.from(document.querySelectorAll('img[src*="pinimg.com"]'))
        .map(img => ({
          img,
          rect: img.getBoundingClientRect(),
        }))
        .filter(item =>
          item.rect.width >= 200 &&
          item.rect.height >= 200 &&
          item.rect.top < window.innerHeight * 1.2
        )
        .sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));

      const best = candidates[0];
      if (!best) return null;

      let imageUrl = best.img.currentSrc || best.img.src || '';
      if (imageUrl.includes('236x')) imageUrl = imageUrl.replace('236x', 'originals');
      else if (imageUrl.includes('474x')) imageUrl = imageUrl.replace('474x', 'originals');
      else if (imageUrl.includes('564x')) imageUrl = imageUrl.replace('564x', 'originals');

      const textSamples = [];
      const selectors = [
        '[aria-label]',
        'button',
        'a',
        'span',
        'div',
      ];

      for (const selector of selectors) {
        for (const el of document.querySelectorAll(selector)) {
          const text = (el.getAttribute('aria-label') || el.textContent || '').trim();
          if (text && text.length <= 120) {
            textSamples.push(text);
          }
        }
      }

      const pageText = document.body ? document.body.innerText : '';
      if (pageText) {
        textSamples.push(pageText);
      }

      let favoriteCount = extractMetric(textSamples, ['save', 'saves', '保存', '收藏']);
      let commentCount = extractMetric(textSamples, ['comment', 'comments', '评论']);
      let shareCount = extractMetric(textSamples, ['share', 'shares', '分享']);
      let likeCount = extractMetric(textSamples, ['like', 'likes', '点赞', '赞']);

      // Pinterest 实际更稳定的互动指标通常是 saves。若没有显式 likes，用 saves 兜底。
      if (!likeCount && favoriteCount) {
        likeCount = favoriteCount;
      }
      if (!favoriteCount && likeCount) {
        favoriteCount = likeCount;
      }

      const pinLink = best.img.closest('a[href*="/pin/"]');

      return {
        image_url: imageUrl,
        detail_page_url: pinLink ? pinLink.href : taskUrl,
        source_page_url: window.location.href,
        width: best.img.naturalWidth || Math.round(best.rect.width) || null,
        height: best.img.naturalHeight || Math.round(best.rect.height) || null,
        like_count: likeCount || 0,
        favorite_count: favoriteCount || 0,
        comment_count: commentCount || 0,
        share_count: shareCount || 0,
      };
    }, task.target_url);
  }

  async extractRecommendationTasks(page, currentUrl) {
    return await page.evaluate((currentPageUrl) => {
      const seen = new Set();
      const currentNormalized = String(currentPageUrl || '').replace(/\/+$/, '');
      const tasks = [];

      for (const link of document.querySelectorAll('a[href*="/pin/"]')) {
        let href = link.href;
        if (!href) continue;

        href = href.replace(/\?.*$/, '').replace(/\/+$/, '');
        if (!href.startsWith('http')) continue;
        if (href === currentNormalized) continue;
        if (seen.has(href)) continue;
        seen.add(href);

        tasks.push({
          task_type: 'detail',
          target_url: href,
          priority: 5,
        });
      }

      return tasks.slice(0, 20);
    }, currentUrl);
  }

  async extractAllPins(page) {
    return await page.evaluate(() => {
      function parseCount(text) {
        if (!text) return 0;
        text = text.trim().toLowerCase().replace(/,/g, '');
        if (text.includes('k')) return Math.round(parseFloat(text) * 1000);
        if (text.includes('m')) return Math.round(parseFloat(text) * 1000000);
        const num = parseInt(text, 10);
        return Number.isNaN(num) ? 0 : num;
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
            const text = (el.textContent || '').trim();
            if (!/^\d[\d,.]*[kmKM]?$/.test(text)) continue;

            const count = parseCount(text);
            if (count > 10000000) continue;

            const parent = el.parentElement;
            const nearby = parent ? (parent.textContent || '').toLowerCase() : '';
            const ariaLabel = String(el.getAttribute('aria-label') || '').toLowerCase();
            const combined = `${nearby} ${ariaLabel}`;

            if (/save|repin|收藏|保存/.test(combined)) {
              favorite_count = Math.max(favorite_count, count);
            } else if (/comment|评论/.test(combined)) {
              comment_count = Math.max(comment_count, count);
            } else if (/like|react|赞|love/.test(combined)) {
              like_count = Math.max(like_count, count);
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
