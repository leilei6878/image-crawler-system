const { chromium } = require('playwright');

class BrowserPool {
  constructor(maxSize = 3) {
    this.maxSize = maxSize;
    this.browsers = [];
    this.available = [];
    this.waiting = [];
  }

  async init() {
    console.log(`[BrowserPool] 初始化 ${this.maxSize} 个浏览器实例...`);
    for (let i = 0; i < this.maxSize; i++) {
      const browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
        ]
      });
      this.browsers.push(browser);
      this.available.push(browser);
    }
    console.log('[BrowserPool] 初始化完成');
  }

  async acquire() {
    if (this.available.length > 0) {
      return this.available.pop();
    }
    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(browser) {
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift();
      resolve(browser);
    } else {
      this.available.push(browser);
    }
  }

  async destroy() {
    for (const browser of this.browsers) {
      try { await browser.close(); } catch {}
    }
    this.browsers = [];
    this.available = [];
  }
}

module.exports = { BrowserPool };
