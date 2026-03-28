import { By, until } from 'selenium-webdriver';
import BaseWalletHandler from './BaseWalletHandler.js';
import { sleep } from '../utils/humanBehavior.js';

const TIMEOUTS = {
  default: 10000,
  short: 3000,
  long: 30000,
};

const LOCATORS = {
  passwordInput: By.id('password'),
  unlockButton: By.css('button.btn-default'),
  confirmButton: By.xpath('//button[text()="Confirm"]'),
  connectButton: By.xpath('//button[text()="Connect"]'),
};

export default class MetaMaskHandler extends BaseWalletHandler {
  constructor(driver, logger, extensionId = 'nkbihfbeogaeaoehlefnkodbefgpgknn') {
    super(driver, logger);
    this.extensionId = extensionId;
  }

  /**
   * Unlock MetaMask with password.
   */
  async unlock(password) {
    this.log.info('Unlocking MetaMask...');

    const unlockUrl = `chrome-extension://${this.extensionId}/home.html#onboarding/unlock`;
    await this.driver.get(unlockUrl);
    await sleep(3000);

    const passwordInput = await this._waitForElement(LOCATORS.passwordInput);
    await passwordInput.sendKeys(password);

    const unlockButton = await this._waitForElement(LOCATORS.unlockButton);
    await unlockButton.click();

    await sleep(5000);
    this.log.info('MetaMask unlocked');
  }

  /**
   * Handle MetaMask popup (confirm/connect).
   * Call this after an action that triggers a MetaMask popup.
   * @param {string[]} handlesBefore - Window handles before the popup trigger
   */
  async confirmTransaction(handlesBefore, password) {
    this.log.info('Waiting for MetaMask popup...');

    if (!handlesBefore) {
      handlesBefore = await this.driver.getAllWindowHandles();
    }

    const popupHandle = await this.waitAndSwitchToPopup(handlesBefore);
    if (!popupHandle) {
      this.log.warn('MetaMask popup not found');
      return false;
    }

    this.log.info('Switched to MetaMask popup');
    await sleep(3000);

    // Check if popup needs unlock first (MetaMask locks after idle)
    const passwordInput = await this._findOptional(LOCATORS.passwordInput, TIMEOUTS.short);
    if (passwordInput && password) {
      this.log.info('MetaMask popup requires unlock...');
      await passwordInput.sendKeys(password);
      const unlockBtn = await this._findOptional(LOCATORS.unlockButton, TIMEOUTS.short);
      if (unlockBtn) {
        await unlockBtn.click();
        await sleep(5000);
        this.log.info('MetaMask unlocked in popup');
      }
    }

    // Now try Confirm, Connect, or other action buttons
    let button = await this._findOptional(LOCATORS.confirmButton, TIMEOUTS.short);
    if (!button) {
      button = await this._findOptional(LOCATORS.connectButton, TIMEOUTS.short);
    }

    if (button) {
      await button.click();
      await sleep(3000);
      this.log.info('Clicked confirm/connect in MetaMask popup');
    } else {
      this.log.warn('No confirm/connect button found in popup');
    }

    // Switch back to main window
    await this.switchToMain();
    return true;
  }

  /**
   * Get current window handles (utility for tasks).
   */
  async getHandles() {
    return this.driver.getAllWindowHandles();
  }

  // ==================== Private helpers ====================

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
