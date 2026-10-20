const { chromium } = require('playwright');

class BrowserPool {
  constructor(maxSize = 3) {
    this.maxSize = maxSize;
    this.browsers = [];
    this.available = [];
    this.waiting = [];
  }

  async createBrowser() {
    return chromium.launch({
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
  }

  async init() {
    console.log(`[BrowserPool] 初始化 ${this.maxSize} 个浏览器实例...`);
    for (let i = 0; i < this.maxSize; i++) {
      const browser = await this.createBrowser();
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
    } else if (this.browsers.length > this.maxSize) {
      this.browsers = this.browsers.filter(item => item !== browser);
      browser.close().catch(() => {});
    } else {
      this.available.push(browser);
    }
  }

  async resize(newSize) {
    const targetSize = Math.max(1, parseInt(newSize, 10) || 1);
    if (targetSize === this.maxSize) return;

    const previousSize = this.maxSize;
    this.maxSize = targetSize;

    if (targetSize > previousSize) {
      console.log(`[BrowserPool] Resize up: ${previousSize} -> ${targetSize}`);
      for (let i = previousSize; i < targetSize; i++) {
        const browser = await this.createBrowser();
        this.browsers.push(browser);
        this.available.push(browser);
      }
      return;
    }

    console.log(`[BrowserPool] Resize down: ${previousSize} -> ${targetSize}`);
    while (this.browsers.length > this.maxSize && this.available.length > 0) {
      const browser = this.available.pop();
      this.browsers = this.browsers.filter(item => item !== browser);
      try { await browser.close(); } catch {}
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
