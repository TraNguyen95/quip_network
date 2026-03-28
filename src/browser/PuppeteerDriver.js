import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'fs';
import BrowserDriver from './BrowserDriver.js';

export default class PuppeteerDriver extends BrowserDriver {
  constructor() {
    super();
    this.browser = null;
    this.page = null;
  }

  async connect(driverPath, remoteAddress, wsUrl) {
    // Puppeteer connects via WebSocket URL
    this.browser = await puppeteer.connect({
      browserWSEndpoint: wsUrl,
      defaultViewport: null,
    });

    // Get existing pages or create new one
    const pages = await this.browser.pages();
    this.page = pages[0] || (await this.browser.newPage());

    return this.browser;
  }

  async navigateTo(url) {
    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }

  async quit() {
    if (this.browser) {
      try {
        this.browser.disconnect();
      } catch {
        // Browser may already be disconnected
      }
      this.browser = null;
      this.page = null;
    }
  }

  async screenshot(filepath) {
    if (!this.page) return;
    const buffer = await this.page.screenshot();
    writeFileSync(filepath, buffer);
  }

  getRawDriver() {
    return { browser: this.browser, page: this.page };
  }
}
