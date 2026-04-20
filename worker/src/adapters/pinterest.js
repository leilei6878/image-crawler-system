const BaseAdapter = require('./base');
const fs = require('fs');
const path = require('path');

const PINTEREST_REQUIRE_LOGIN = process.env.PINTEREST_REQUIRE_LOGIN !== 'false';

class PinterestAdapter extends BaseAdapter {
  constructor() {
    super('pinterest');
  }

  attachPinResponseCollector(page) {
    const collector = new Map();

    const visit = (value) => {
      if (!value || typeof value !== 'object') return;

      if (Array.isArray(value)) {
        for (const item of value) visit(item);
        return;
      }

      const imageUrl =
        (value.images_orig && value.images_orig.url) ||
        value.imageLargeUrl ||
        (value.images_736x && value.images_736x.url) ||
        (value.images_564x && value.images_564x.url) ||
        (value.images_474x && value.images_474x.url) ||
        (value.images_236x && value.images_236x.url) ||
        (value.images_170x && value.images_170x.url) ||
        null;

      const entityId = value.entityId || value.id || null;
      if (entityId && imageUrl) {
        const detailPageUrl = value.seoUrl
          ? `https://www.pinterest.com${value.seoUrl.startsWith('/') ? '' : '/'}${value.seoUrl}`
          : (value.link || null);

        collector.set(String(entityId), {
          entityId: String(entityId),
          image_url: imageUrl,
          detail_page_url: detailPageUrl,
          source_page_url: null,
          author_name:
            (value.closeupAttribution && value.closeupAttribution.fullName) ||
            (value.nativeCreator && value.nativeCreator.fullName) ||
            (value.pinner && value.pinner.username) ||
            null,
          author_url:
            value.pinner && value.pinner.username
              ? `https://www.pinterest.com/${value.pinner.username}/`
              : null,
          width:
            (value.images_orig && value.images_orig.width) ||
            (value.images_736x && value.images_736x.width) ||
            (value.images_564x && value.images_564x.width) ||
            (value.images_474x && value.images_474x.width) ||
            (value.images_236x && value.images_236x.width) ||
            null,
          height:
            (value.images_orig && value.images_orig.height) ||
            (value.images_736x && value.images_736x.height) ||
            (value.images_564x && value.images_564x.height) ||
            (value.images_474x && value.images_474x.height) ||
            (value.images_236x && value.images_236x.height) ||
            null,
          like_count: value.likeCount || value.likesCount || 0,
          favorite_count:
            value.aggregatedPinData &&
            value.aggregatedPinData.aggregatedStats &&
            value.aggregatedPinData.aggregatedStats.saves
              ? value.aggregatedPinData.aggregatedStats.saves
              : (value.repinCount || 0),
          comment_count: value.commentCount || value.commentsCount || 0,
          share_count: value.shareCount || value.sharesCount || 0,
        });
      }

      for (const nested of Object.values(value)) visit(nested);
    };

    const onResponse = async (response) => {
      try {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';
        if (!contentType.includes('application/json') && !/graphql|resource|pin/i.test(url)) {
          return;
        }

        const payload = await response.json().catch(() => null);
        if (!payload) return;
        visit(payload);
      } catch {}
    };

    page.on('response', onResponse);
    return collector;
  }

  mergePins(...groups) {
    const merged = new Map();

    for (const group of groups) {
      for (const pin of group || []) {
        if (!pin || !pin.image_url) continue;
        const key = pin.detail_page_url || pin.image_url;
        const existing = merged.get(key) || {};
        merged.set(key, {
          ...existing,
          ...pin,
          image_url: pin.image_url || existing.image_url,
          detail_page_url: pin.detail_page_url || existing.detail_page_url || null,
          source_page_url: pin.source_page_url || existing.source_page_url || null,
          author_name: pin.author_name || existing.author_name || null,
          author_url: pin.author_url || existing.author_url || null,
          width: pin.width ?? existing.width ?? null,
          height: pin.height ?? existing.height ?? null,
          like_count: pin.like_count ?? existing.like_count ?? null,
          favorite_count: pin.favorite_count ?? existing.favorite_count ?? null,
          comment_count: pin.comment_count ?? existing.comment_count ?? null,
          share_count: pin.share_count ?? existing.share_count ?? null,
        });
      }
    }

    return Array.from(merged.values());
  }

  isUsefulImage(pin) {
    const url = String((pin && pin.image_url) || '').toLowerCase();
    if (!url) return false;
    if (url.includes('avatar') || url.includes('/user/')) return false;
    if (url.includes('140x140_rs') || url.includes('75x75') || url.includes('60x60') || url.includes('30x30')) return false;
    return true;
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
          console.log(`[Pinterest] loaded storage state: ${storagePath} (${storageState.cookies.length} cookies)`);
          return { loaded: true, source: storagePath, type: 'storage_state' };
        }
      } catch (err) {
        console.log(`[Pinterest] failed to load storage state: ${storagePath} - ${err.message}`);
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
        console.log(`[Pinterest] loaded cookies: ${cookiePath} (${cookies.length} cookies)`);
        return { loaded: true, source: cookiePath, type: 'cookies' };
      } catch (err) {
        console.log(`[Pinterest] failed to load cookies: ${cookiePath} - ${err.message}`);
      }
    }

    const authHint = [
      process.env.PINTEREST_COOKIE_PATH ? `PINTEREST_COOKIE_PATH=${process.env.PINTEREST_COOKIE_PATH}` : null,
      process.env.PINTEREST_STORAGE_STATE_PATH ? `PINTEREST_STORAGE_STATE_PATH=${process.env.PINTEREST_STORAGE_STATE_PATH}` : null,
      'worker/cookies/pinterest.json',
      'worker/cookies/pinterest-storage-state.json',
    ].filter(Boolean).join(', ');

    if (PINTEREST_REQUIRE_LOGIN) {
      throw new Error(`Pinterest auth state is missing. Provide cookies or storage state. Paths: ${authHint}`);
    }

    console.log('[Pinterest] auth state not found, continue in guest mode');
    return { loaded: false, source: null, type: 'guest' };
  }

  async ensureAuthenticated(context, page, authState) {
    const cookies = await context.cookies('https://www.pinterest.com');
    const hasSessionCookie = cookies.some(cookie => cookie.name === '_pinterest_sess' && cookie.value);

    const currentUrl = page.url();
    const loginWallDetected = await page.evaluate(() => {
      const pageText = document.body ? document.body.innerText.toLowerCase() : '';
      return (
        pageText.includes('log in') ||
        pageText.includes('sign up') ||
        pageText.includes('continue with email') ||
        pageText.includes('continue')
      );
    }).catch(() => false);

    if (PINTEREST_REQUIRE_LOGIN && (!hasSessionCookie || /\/login/i.test(currentUrl) || loginWallDetected)) {
      const source = authState && authState.source ? authState.source : 'unknown';
      throw new Error(`Pinterest auth state is invalid or expired: ${source}`);
    }

    if (hasSessionCookie) {
      console.log('[Pinterest] authenticated session detected');
    }
  }

  async crawl(page, task) {
    const timeout = (task.page_timeout_seconds || 60) * 1000;
    const pinCollector = this.attachPinResponseCollector(page);

    console.log(`[Pinterest] start crawl: ${task.target_url} (type=${task.task_type})`);

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
      console.log('[Pinterest] detected detail pin page');
      return this.crawlDetail(page, task, pinCollector);
    }

    console.log('[Pinterest] detected listing page');
    return this.crawlListing(page, task, pinCollector);
  }

  async crawlListing(page, task, pinCollector) {
    try {
      await page.waitForSelector('[data-test-id="pin"], [role="listitem"], img[src*="pinimg.com"]', { timeout: 15000 });
    } catch {
      console.log('[Pinterest] listing page pin elements not found');
    }

    if (task.auto_scroll_seconds > 0) {
      console.log(`[Pinterest] auto scroll listing page: ${task.auto_scroll_seconds}s / max ${task.auto_scroll_max_rounds || 10} rounds`);
      await this.scrollPage(page, task.auto_scroll_seconds, task.auto_scroll_max_rounds || 10);
    }

    const rawPins = this.mergePins(await this.extractAllPins(page), Array.from((pinCollector || new Map()).values()));
    console.log(`[Pinterest] listing page extracted images: ${rawPins.length}`);

    const images = rawPins.map(pin => this.normalizeImage(pin));
    return { images, new_tasks: [] };
  }

  async crawlDetail(page, task, pinCollector) {
    console.log('[Pinterest] waiting for detail content');

    try {
      await page.waitForSelector('img[src*="pinimg.com"]', { timeout: 15000 });
    } catch {
      console.log('[Pinterest] pin image not found');
    }

    await page.waitForTimeout(2000);

    const beforeScrollCount = await page.evaluate(() => document.querySelectorAll('img[src*="pinimg.com"]').length);
    console.log(`[Pinterest] images before scroll: ${beforeScrollCount}`);

    if (task.auto_scroll_seconds > 0) {
      console.log(`[Pinterest] auto scroll detail page: ${task.auto_scroll_seconds}s / max ${task.auto_scroll_max_rounds || 10} rounds`);
      await this.scrollPage(page, task.auto_scroll_seconds, task.auto_scroll_max_rounds || 10);
    }

    const afterScrollCount = await page.evaluate(() => document.querySelectorAll('img[src*="pinimg.com"]').length);
    console.log(`[Pinterest] images after scroll: ${afterScrollCount}`);

    const primaryPin = await this.extractPrimaryPin(page, task);
    const pagePins = await this.extractAllPins(page);
    const networkPins = Array.from((pinCollector || new Map()).values()).map(pin => ({
      ...pin,
      source_page_url: page.url(),
    }));
    const mergedPins = this.mergePins(primaryPin ? [primaryPin] : [], pagePins, networkPins)
      .filter(pin => this.isUsefulImage(pin));

    if (primaryPin) {
      console.log(`[Pinterest] detail metrics: like=${primaryPin.like_count || 0} fav=${primaryPin.favorite_count || 0} comment=${primaryPin.comment_count || 0} share=${primaryPin.share_count || 0}`);
    }
    console.log(`[Pinterest] detail page extracted images: ${mergedPins.length}; auto expansion disabled`);

    const images = mergedPins.map(pin => this.normalizeImage(pin));
    return { images, new_tasks: [] };
  }

  async extractPrimaryPin(page, task) {
    return await page.evaluate((taskUrl) => {
      function parseCount(text) {
        if (!text) return 0;
        const normalized = String(text).trim().toLowerCase().replace(/,/g, '');
        if (normalized.includes('k')) return Math.round(parseFloat(normalized) * 1000);
        if (normalized.includes('m')) return Math.round(parseFloat(normalized) * 1000000);
        const num = parseInt(normalized, 10);
        return Number.isNaN(num) ? 0 : num;
      }

      function escapeRegex(value) {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }

      function extractMetric(texts, keywords) {
        let max = 0;
        for (const text of texts) {
          const value = String(text || '').replace(/\s+/g, ' ').trim();
          if (!value) continue;

          for (const keyword of keywords) {
            const escaped = escapeRegex(keyword);
            const afterRegex = new RegExp(`(\\d[\\d,.]*[kKmM]?)\\s*${escaped}`, 'i');
            const beforeRegex = new RegExp(`${escaped}\\s*(\\d[\\d,.]*[kKmM]?)`, 'i');

            const afterMatch = value.match(afterRegex);
            if (afterMatch) max = Math.max(max, parseCount(afterMatch[1]));

            const beforeMatch = value.match(beforeRegex);
            if (beforeMatch) max = Math.max(max, parseCount(beforeMatch[1]));
          }
        }
        return max;
      }

      function extractMetricFromSerializedData(serialized, keyPatterns, pinId) {
        if (!serialized) return 0;

        const scopes = [serialized];
        if (pinId) {
          const pinRegex = new RegExp(`.{0,800}${escapeRegex(pinId)}.{0,800}`, 'g');
          const matches = serialized.match(pinRegex);
          if (Array.isArray(matches) && matches.length > 0) {
            scopes.unshift(...matches);
          }
        }

        let max = 0;
        for (const scope of scopes) {
          for (const key of keyPatterns) {
            const regex = new RegExp(`["']${escapeRegex(key)}["']\\s*:\\s*(\\d+)`, 'ig');
            let match = regex.exec(scope);
            while (match) {
              max = Math.max(max, parseCount(match[1]));
              match = regex.exec(scope);
            }
          }
        }
        return max;
      }

      function extractRelayPinData(pinId) {
        const requests = window.__PWS_RELAY_SSR_REQUESTS__ || {};
        const entries = Object.entries(requests);

        for (const [requestKey, requestValue] of entries) {
          if (pinId && !String(requestKey).includes(pinId)) continue;

          const pinData =
            requestValue &&
            requestValue.response &&
            requestValue.response.data &&
            requestValue.response.data.v3GetPinQueryv2 &&
            requestValue.response.data.v3GetPinQueryv2.data;

          if (pinData) {
            return pinData;
          }
        }

        for (const requestValue of Object.values(requests)) {
          const pinData =
            requestValue &&
            requestValue.response &&
            requestValue.response.data &&
            requestValue.response.data.v3GetPinQueryv2 &&
            requestValue.response.data.v3GetPinQueryv2.data;

          if (pinData) {
            return pinData;
          }
        }

        return null;
      }

      const pinIdMatch = String(taskUrl || window.location.href).match(/\/pin\/(\d+)/i);
      const pinId = pinIdMatch ? pinIdMatch[1] : null;
      const relayPinData = extractRelayPinData(pinId);

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

      const best = candidates[0] || null;

      let imageUrl = best ? (best.img.currentSrc || best.img.src || '') : '';
      if (!imageUrl && relayPinData) {
        imageUrl =
          (relayPinData.images_orig && relayPinData.images_orig.url) ||
          relayPinData.imageLargeUrl ||
          (relayPinData.images_736x && relayPinData.images_736x.url) ||
          (relayPinData.images_564x && relayPinData.images_564x.url) ||
          (relayPinData.images_474x && relayPinData.images_474x.url) ||
          '';
      }
      if (!imageUrl) return null;

      if (imageUrl.includes('236x')) imageUrl = imageUrl.replace('236x', 'originals');
      else if (imageUrl.includes('474x')) imageUrl = imageUrl.replace('474x', 'originals');
      else if (imageUrl.includes('564x')) imageUrl = imageUrl.replace('564x', 'originals');

      const textSamples = [];
      for (const selector of ['[aria-label]', 'button', 'a', 'span', 'div']) {
        for (const el of document.querySelectorAll(selector)) {
          const text = (el.getAttribute('aria-label') || el.textContent || '').trim();
          if (text && text.length <= 160) {
            textSamples.push(text);
          }
        }
      }

      if (document.body && document.body.innerText) {
        textSamples.push(document.body.innerText);
      }

      const serializedData = Array.from(document.querySelectorAll('script'))
        .map(script => script.textContent || '')
        .filter(Boolean)
        .join('\n');

      let favoriteCount = Math.max(
        relayPinData ? parseCount(relayPinData.repinCount) : 0,
        relayPinData && relayPinData.aggregatedPinData && relayPinData.aggregatedPinData.aggregatedStats
          ? parseCount(relayPinData.aggregatedPinData.aggregatedStats.saves)
          : 0,
        extractMetric(textSamples, [
          'save',
          'saves',
          'saved',
          'save to profile',
          'repin',
          '保存',
          '收藏',
          'ulozeni',
          'uložení',
          'ulozeno',
          'uloženo',
          'ulozit',
          'uložit',
        ]),
        extractMetricFromSerializedData(serializedData, [
          'repin_count',
          'repinCount',
          'save_count',
          'saveCount',
          'saves_count',
          'savesCount',
          'favorite_count',
          'favoriteCount',
        ], pinId)
      );

      let commentCount = Math.max(
        relayPinData ? parseCount(relayPinData.commentCount || relayPinData.commentsCount) : 0,
        extractMetric(textSamples, [
          'comment',
          'comments',
          '评论',
          '留言',
          'komentar',
          'komentář',
          'komentare',
          'komentáře',
        ]),
        extractMetricFromSerializedData(serializedData, [
          'comment_count',
          'commentCount',
          'comments_count',
          'commentsCount',
        ], pinId)
      );

      let shareCount = Math.max(
        relayPinData ? parseCount(relayPinData.shareCount || relayPinData.sharesCount) : 0,
        extractMetric(textSamples, [
          'share',
          'shares',
          '分享',
          'sdilet',
          'sdílet',
        ]),
        extractMetricFromSerializedData(serializedData, [
          'share_count',
          'shareCount',
          'shares_count',
          'sharesCount',
        ], pinId)
      );

      let likeCount = Math.max(
        relayPinData ? parseCount(relayPinData.likeCount || relayPinData.likesCount) : 0,
        extractMetric(textSamples, [
          'like',
          'likes',
          '点赞',
          '赞',
          'libi',
          'líbí',
        ]),
        extractMetricFromSerializedData(serializedData, [
          'like_count',
          'likeCount',
          'likes_count',
          'likesCount',
          'reaction_count',
          'reactionCount',
        ], pinId)
      );

      const pinLink = best ? best.img.closest('a[href*="/pin/"]') : null;
      const detailPageUrl = pinLink ? pinLink.href : taskUrl;
      const authorName =
        (relayPinData && relayPinData.closeupAttribution && relayPinData.closeupAttribution.fullName) ||
        (relayPinData && relayPinData.nativeCreator && relayPinData.nativeCreator.fullName) ||
        (relayPinData && relayPinData.pinner && relayPinData.pinner.username) ||
        null;
      const authorUrl =
        (relayPinData && relayPinData.pinner && relayPinData.pinner.username)
          ? `https://www.pinterest.com/${relayPinData.pinner.username}/`
          : null;
      const normalizedWidth =
        (relayPinData && relayPinData.images_orig && relayPinData.images_orig.width) ||
        (relayPinData && relayPinData.images_736x && relayPinData.images_736x.width) ||
        (relayPinData && relayPinData.images_564x && relayPinData.images_564x.width) ||
        (relayPinData && relayPinData.images_474x && relayPinData.images_474x.width) ||
        (relayPinData && relayPinData.images_236x && relayPinData.images_236x.width) ||
        (relayPinData && relayPinData.images_170x && relayPinData.images_170x.width) ||
        (best && best.img && best.img.naturalWidth) ||
        (best && best.rect ? Math.round(best.rect.width) : null) ||
        null;
      const normalizedHeight =
        (relayPinData && relayPinData.images_orig && relayPinData.images_orig.height) ||
        (relayPinData && relayPinData.images_736x && relayPinData.images_736x.height) ||
        (relayPinData && relayPinData.images_564x && relayPinData.images_564x.height) ||
        (relayPinData && relayPinData.images_474x && relayPinData.images_474x.height) ||
        (relayPinData && relayPinData.images_236x && relayPinData.images_236x.height) ||
        (best && best.img && best.img.naturalHeight) ||
        (best && best.rect ? Math.round(best.rect.height) : null) ||
        null;

      return {
        image_url: imageUrl,
        detail_page_url: detailPageUrl,
        source_page_url: window.location.href,
        author_name: authorName,
        author_url: authorUrl,
        width: normalizedWidth,
        height: normalizedHeight,
        like_count: likeCount || 0,
        favorite_count: favoriteCount || 0,
        comment_count: commentCount || 0,
        share_count: shareCount || 0,
      };
    }, task.target_url);
  }

  async extractAllPins(page) {
    return await page.evaluate(() => {
      function parseCount(text) {
        if (!text) return 0;
        const normalized = String(text).trim().toLowerCase().replace(/,/g, '');
        if (normalized.includes('k')) return Math.round(parseFloat(normalized) * 1000);
        if (normalized.includes('m')) return Math.round(parseFloat(normalized) * 1000000);
        const num = parseInt(normalized, 10);
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

          let likeCount = 0;
          let commentCount = 0;
          let favoriteCount = 0;

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

            if (/save|repin|saved|收藏|保存|ulozeni|uložení/.test(combined)) {
              favoriteCount = Math.max(favoriteCount, count);
            } else if (/comment|评论|留言|komentar|komentář/.test(combined)) {
              commentCount = Math.max(commentCount, count);
            } else if (/like|react|love|点赞|赞|libi|líbí/.test(combined)) {
              likeCount = Math.max(likeCount, count);
            }
          }

          results.push({
            image_url: highRes,
            detail_page_url: link ? link.href : null,
            source_page_url: window.location.href,
            width: img.naturalWidth || null,
            height: img.naturalHeight || null,
            like_count: likeCount,
            favorite_count: favoriteCount,
            comment_count: commentCount,
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
