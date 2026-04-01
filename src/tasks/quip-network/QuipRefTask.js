import { By, until } from 'selenium-webdriver';
import BaseTask from '../BaseTask.js';
import DataStore from '../../services/DataStore.js';
import { sleep } from '../../utils/humanBehavior.js';


export default class QuipRefTask extends BaseTask {
  static taskName = 'quip-ref';
  static description = 'Quip Network — get referral link and save to Excel';

  async execute(driver, account, { logger, wallet, config }) {
    const walletPassword = account.wallet_password || '';
    const walletType = (account.wallet_type || config.wallet?.type || 'metamask').toLowerCase();

    // Step 1: Unlock wallet
    logger.info(`Unlocking wallet (${walletType})...`);
    await wallet.unlock(walletPassword);

    // Step 2: Navigate to Quip
    const url = 'https://quest.quip.network/airdrop';
    logger.info(`Navigating to ${url}`);
    await driver.get(url);
    await sleep(5000);

    // Step 3: Check if wallet connected
    const notConnected = await driver.executeScript(`
      const els = document.querySelectorAll('*');
      for (const el of els) {
        const t = el.textContent.trim();
        if ((t === 'Connect Wallet' || t === 'Connect') && el.children.length === 0) return true;
      }
      return false;
    `);
    if (notConnected) {
      logger.warn('Wallet not connected — writing "not connected" to Excel');
      const dataStore = new DataStore(config);
      dataStore.updateCell(account.profileName, 'link ref', 'not connected');
      return { success: true, data: { refLink: 'not connected' } };
    }

    // Step 4: Click "Get My Referral Link"
    logger.info('Clicking "Get My Referral Link"...');
    const refBtn = await this._findOptional(driver, By.xpath("//span[text()='Get My Referral Link']"), 10000);
    if (!refBtn) {
      logger.warn('"Get My Referral Link" button not found');
      return { success: false, error: 'Get My Referral Link button not found' };
    }
    await driver.executeScript('arguments[0].click();', refBtn);
    await sleep(3000);

    // Step 4: Wait for popup with h2
    logger.info('Waiting for referral popup...');
    const popupH2 = await this._findOptional(driver,
      By.xpath("//h2[contains(text(),'Earn rewards when a new user signs up with your referral link')]"), 10000);
    if (!popupH2) {
      logger.warn('Referral popup not found');
      return { success: false, error: 'Referral popup not found' };
    }

    // Step 5: Get referral link from readonly input
    const refLink = await driver.executeScript(`
      const input = document.querySelector('div.relative.bg-ui-secondary input[readonly]');
      return input ? input.value : null;
    `);

    if (!refLink) {
      logger.warn('Referral link input not found');
      return { success: false, error: 'Referral link input not found' };
    }

    logger.info(`Referral link: ${refLink}`);

    // Step 6: Save to Excel column "link ref"
    const dataStore = new DataStore(config);
    dataStore.updateCell(account.profileName, 'link ref', refLink);

    return { success: true, data: { refLink } };
  }

  async _waitFor(driver, locator, timeout = 10000) {
    const el = await driver.wait(until.elementLocated(locator), timeout);
    await driver.wait(until.elementIsVisible(el), timeout);
    return el;
  }

  async _findOptional(driver, locator, timeout = 3000) {
    try { return await this._waitFor(driver, locator, timeout); }
    catch { return null; }
  }
}
