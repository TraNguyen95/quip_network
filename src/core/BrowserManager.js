import SeleniumDriver from '../browser/SeleniumDriver.js';
import PuppeteerDriver from '../browser/PuppeteerDriver.js';
import GpmClient from './GpmClient.js';
import WindowManager from './WindowManager.js';
import { getLogger } from '../services/Logger.js';
import { resolve } from 'path';
import { ROOT_DIR } from '../config/default.js';

/**
 * Manages browser profile lifecycle:
 * start GPM profile → connect driver → run task → close profile
 */
export default class BrowserManager {
  constructor(config) {
    this.config = config;
    this.gpm = new GpmClient(config);
    this.windowManager = new WindowManager(config);
    this.driverType = config.execution.driver; // 'selenium' or 'puppeteer'
  }

  get log() {
    return getLogger();
  }

  createDriver() {
    if (this.driverType === 'puppeteer') {
      return new PuppeteerDriver();
    }
    return new SeleniumDriver();
  }

  /**
   * Start a GPM profile and connect a browser driver.
   * Returns { driver, browserDriver, profileId, rawDriver }
   */
  async startAndConnect(profileId, index) {
    const { width, height } = this.windowManager.getWindowSize();
    const { x, y } = this.windowManager.getPosition(index);

    // Start GPM profile
    const result = await this.gpm.startProfile(profileId, { width, height, x, y });
    const { driverPath, remoteAddress } = result;

    // Create and connect browser driver
    const browserDriver = this.createDriver();

    if (this.driverType === 'puppeteer') {
      // Puppeteer needs WebSocket URL
      const wsUrl = await this.gpm.waitForBrowser(remoteAddress);
      await browserDriver.connect(driverPath, remoteAddress, wsUrl);
    } else {
      // Selenium connects via debug address
      await browserDriver.connect(driverPath, remoteAddress);
    }

    const rawDriver = browserDriver.getRawDriver();

    return { browserDriver, rawDriver, profileId };
  }

  /**
   * Close browser driver and GPM profile.
   */
  async closeAll(browserDriver, profileId) {
    try {
      await browserDriver.quit();
    } catch (e) {
      this.log.warn(`Error quitting driver for ${profileId}: ${e.message}`);
    }

    try {
      await this.gpm.closeProfile(profileId);
    } catch (e) {
      this.log.warn(`Error closing GPM profile ${profileId}: ${e.message}`);
    }
  }

  /**
   * Take error screenshot.
   */
  async screenshotOnError(browserDriver, profileName) {
    try {
      const screenshotDir = resolve(ROOT_DIR, 'logs', 'screenshots');
      const { mkdirSync, existsSync } = await import('fs');
      if (!existsSync(screenshotDir)) mkdirSync(screenshotDir, { recursive: true });

      const filepath = resolve(screenshotDir, `${profileName}_${Date.now()}.png`);
      await browserDriver.screenshot(filepath);
      this.log.info(`Screenshot saved: ${filepath}`, { profile: profileName });
    } catch {
      // Screenshot failed, not critical
    }
  }
}
