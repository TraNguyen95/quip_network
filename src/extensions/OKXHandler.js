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
    await this.driver.get(unlockUrl);
    await sleep(5000);

    // Debug screenshot
    try {
      const { writeFileSync } = await import('fs');
      const img = await this.driver.takeScreenshot();
      writeFileSync('logs/screenshots/okx_unlock_page.png', img, 'base64');
      this.log.info('OKX unlock page screenshot saved');
    } catch {}

    const passwordInput = await this._waitForElement(LOCATORS.passwordInput);
    await passwordInput.sendKeys(password);
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

    const popupHandle = await this.waitAndSwitchToPopup(handlesBefore);
    if (!popupHandle) {
      this.log.warn('OKX Wallet popup not found');
      return false;
    }

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
    for (const h of handles) {
      await this.driver.switchTo().window(h);
      const url = await this.driver.getCurrentUrl();
      if (!url.startsWith('chrome-extension://') || url.includes('fullscreen.html') || url.includes('popup.html') || url.includes('home.html')) {
        if (!url.includes('background.html')) {
          return;
        }
      }
    }
    // Fallback: use first handle
    if (handles.length > 0) {
      await this.driver.switchTo().window(handles[0]);
    }
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
