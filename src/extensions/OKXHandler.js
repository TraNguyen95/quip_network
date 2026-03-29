import { By, until } from 'selenium-webdriver';
import BaseWalletHandler from './BaseWalletHandler.js';
import { sleep } from '../utils/humanBehavior.js';

const TIMEOUTS = {
  default: 10000,
  short: 3000,
  long: 30000,
};

const LOCATORS = {
  passwordInput: By.css('input[type="password"]'),
  unlockButton: By.xpath('//button[contains(.,"Unlock")]'),
  confirmButton: By.xpath('//button[contains(.,"Confirm")]'),
  connectButton: By.xpath('//button[contains(.,"Connect")]'),
  approveButton: By.xpath('//button[contains(.,"Approve")]'),
};

export default class OKXHandler extends BaseWalletHandler {
  constructor(driver, logger, extensionId = 'oaonnfepgafchfeggefgljggcbeejddn') {
    super(driver, logger);
    this.extensionId = extensionId;
  }

  /**
   * Unlock OKX Wallet with password.
   */
  async unlock(password) {
    this.log.info('Unlocking OKX Wallet...');

    // Ensure we're on a page tab, not a background/service worker tab
    await this._switchToPageTab();

    const unlockUrl = `chrome-extension://${this.extensionId}/fullscreen.html#/unlock`;
    this.log.info(`OKX unlock URL: ${unlockUrl}`);

    // Navigate with retry — extension may not be ready yet
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.driver.get(unlockUrl);
      await sleep(5000);
      const currentUrl = await this.driver.getCurrentUrl();
      this.log.info(`After navigate: ${currentUrl}`);
      if (currentUrl.includes(this.extensionId)) break;
      this.log.warn(`Navigate failed (attempt ${attempt + 1}), retrying...`);
      await sleep(3000);
    }

    const passwordInput = await this._waitForElement(LOCATORS.passwordInput);
    await this.driver.executeScript(`
      const el = arguments[0];
      el.focus();
      el.value = arguments[1];
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    `, passwordInput, password);
    await sleep(1000);

    // Wait for Unlock button to become enabled after password input
    const unlockButton = await this._waitForElement(LOCATORS.unlockButton);
    await this.driver.wait(until.elementIsEnabled(unlockButton), TIMEOUTS.default);
    await this.driver.executeScript('arguments[0].click();', unlockButton);

    await sleep(5000);
    this.log.info('OKX Wallet unlocked');
  }

  /**
   * Handle OKX Wallet popup (confirm/connect/approve).
   * @param {string[]} handlesBefore - Window handles before the popup trigger
   */
  async confirmTransaction(handlesBefore) {
    this.log.info('Waiting for OKX Wallet popup...');

    if (!handlesBefore) {
      handlesBefore = await this.driver.getAllWindowHandles();
    }

    // Find OKX popup by URL instead of relying on handle order
    await sleep(3000);
    const allHandles = await this.driver.getAllWindowHandles();
    let popupHandle = null;

    for (const h of allHandles) {
      await this.driver.switchTo().window(h);
      const url = await this.driver.getCurrentUrl();
      // OKX popup contains extension ID and is not background page
      if (url.includes(this.extensionId) && !url.includes('background')) {
        // Skip if this is the fullscreen wallet page we navigated to earlier
        if (url.includes('#/unlock') || url === `chrome-extension://${this.extensionId}/fullscreen.html#/`) continue;
        popupHandle = h;
        this.log.info(`Found OKX popup: ${url}`);
        break;
      }
    }

    if (!popupHandle) {
      this.log.warn('OKX Wallet popup not found');
      await this.switchToMain();
      return false;
    }

    await this.driver.switchTo().window(popupHandle);
    this.log.info('Switched to OKX Wallet popup');
    await sleep(3000);

    // Try multiple button patterns
    let button = await this._findOptional(LOCATORS.confirmButton, TIMEOUTS.short);
    if (!button) button = await this._findOptional(LOCATORS.connectButton, TIMEOUTS.short);
    if (!button) button = await this._findOptional(LOCATORS.approveButton, TIMEOUTS.short);

    if (button) {
      await this.driver.executeScript('arguments[0].click();', button);
      await sleep(3000);
      this.log.info('Clicked confirm in OKX Wallet popup');
    } else {
      // Fallback: click any primary/highlight button via JS
      const clicked = await this.driver.executeScript(`
        const btns = document.querySelectorAll('button.btn-fill-highlight, button.btn-fill-primary');
        if (btns.length > 0) { btns[btns.length - 1].click(); return true; }
        return false;
      `);
      if (clicked) {
        await sleep(3000);
        this.log.info('Clicked OKX popup button via fallback');
      } else {
        this.log.warn('No confirm button found in OKX popup');
      }
    }

    await this.switchToMain();
    return true;
  }

  async getHandles() {
    return this.driver.getAllWindowHandles();
  }

  async _switchToPageTab() {
    const handles = await this.driver.getAllWindowHandles();
    this.log.info(`Window handles: ${handles.length}`);

    // Log all handles first
    const handleUrls = [];
    for (const h of handles) {
      await this.driver.switchTo().window(h);
      const url = await this.driver.getCurrentUrl();
      this.log.info(`  Handle ${h.substring(0, 8)}: ${url}`);
      handleUrls.push({ handle: h, url });
    }

    // Pick a real page tab (not extension, not about:blank)
    const pageTab = handleUrls.find(h =>
      !h.url.includes('chrome-extension://') &&
      !h.url.startsWith('about:blank')
    );
    if (pageTab) {
      await this.driver.switchTo().window(pageTab.handle);
      this.log.info(`Switched to: ${pageTab.url}`);
      return;
    }

    // No real page tab found — create a new tab
    this.log.info('No suitable tab found, creating new tab');
    await this.driver.switchTo().newWindow('tab');
  }

  async _waitForElement(locator, timeout = TIMEOUTS.default) {
    const el = await this.driver.wait(until.elementLocated(locator), timeout);
    await this.driver.wait(until.elementIsVisible(el), timeout);
    return el;
  }

  async _findOptional(locator, timeout = TIMEOUTS.short) {
    try {
      return await this._waitForElement(locator, timeout);
    } catch {
      return null;
    }
  }
}
