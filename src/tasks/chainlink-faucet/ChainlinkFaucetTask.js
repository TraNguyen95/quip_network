import { By, until } from 'selenium-webdriver';
import BaseTask from '../BaseTask.js';
import { sleep } from '../../utils/humanBehavior.js';

const WEBSITE_URL = 'https://faucets.chain.link/';

/**
 * Flow thực tế (verified qua Playwright MCP inspect GPM browser 2026-03-28):
 * 1. Chọn faucet card → thanh bar "N Faucet selected" xuất hiện
 * 2. Click "Continue"
 * 3. Modal "Add wallet addresses" mở ra
 * 4. Nhập wallet address vào input
 * 5. Cloudflare Turnstile captcha (không bypass được — chờ user solve thủ công)
 * 6. Click "Send request"
 */

const LOCATORS = {
  // Faucet cards (data-testid — ổn định nhất)
  faucets: {
    'ethereum-sepolia-eth': By.css('button[data-testid="faucet_card_sepolia_native"]'),
    'ethereum-sepolia-link': By.css('button[data-testid="faucet_card_sepolia_link"]'),
    'base-sepolia': By.css('button[data-testid="faucet_card_base-sepolia_native"]'),
    'arbitrum-sepolia': By.css('button[data-testid="faucet_card_arbitrum-sepolia_native"]'),
    'polygon-amoy': By.css('button[data-testid="faucet_card_polygon-amoy_native"]'),
    'avalanche-fuji': By.css('button[data-testid="faucet_card_fuji_native"]'),
  },
  faucetFallback: By.xpath('//h3[text()="Ethereum Sepolia"]/ancestor::button'),

  // Sau khi chọn faucet → thanh bar dưới cùng
  continueButton: By.xpath('//button[text()="Continue"]'),
  clearAllButton: By.xpath('//button[text()="Clear all"]'),

  // Modal "Add wallet addresses"
  walletAddressInput: By.xpath('//input[@placeholder="Enter wallet address"]'),
  closeModalButton: By.xpath('//button[contains(.,"Close modal") or @aria-label="Close modal"]'),

  // Captcha + Submit
  sendRequestButton: By.xpath('//button[contains(text(),"Send request") or contains(text(),"Send Request")]'),

  // Get wallet address from MetaMask
  // (dùng JS inject để lấy address từ MetaMask provider)
};

export default class ChainlinkFaucetTask extends BaseTask {
  static taskName = 'chainlink-faucet';
  static description = 'Chainlink Faucet — claim testnet tokens (ETH/LINK/AVAX)';

  async execute(driver, account, { logger, wallet, config }) {
    const network = account.faucet_network || 'ethereum-sepolia-eth';
    const walletPassword = account.wallet_password || '';
    const walletAddress = account.wallet_address || '';

    // Step 1: Unlock MetaMask
    logger.info('Unlocking wallet...');
    await wallet.unlock(walletPassword);

    // Step 2: Lấy wallet address nếu chưa có trong Excel
    let address = walletAddress;
    if (!address) {
      address = await this._getWalletAddress(driver, config, logger);
    }

    if (!address) {
      logger.error('No wallet address available. Add wallet_address column in Excel.');
      return { success: false, error: 'No wallet address' };
    }
    logger.info(`Wallet address: ${address.slice(0, 8)}...${address.slice(-6)}`);

    // Step 3: Navigate to Chainlink Faucet
    logger.info(`Navigating to ${WEBSITE_URL}`);
    await driver.get(WEBSITE_URL);
    await sleep(5000);

    // Step 4: Dismiss overlays
    await this._dismissOverlays(driver, logger);

    // Step 5: Chọn faucet card
    logger.info(`Selecting faucet: ${network}`);
    const faucetLocator = LOCATORS.faucets[network] || LOCATORS.faucets['ethereum-sepolia-eth'];
    let faucetButton = await this._findOptional(driver, faucetLocator, 5000);
    if (!faucetButton) {
      faucetButton = await this._findOptional(driver, LOCATORS.faucetFallback, 5000);
    }

    if (faucetButton) {
      await driver.executeScript('arguments[0].scrollIntoView({block:"center"});', faucetButton);
      await sleep(500);
      await driver.executeScript('arguments[0].click();', faucetButton);
      await sleep(2000);
      logger.info('Faucet selected');
    } else {
      logger.error('Faucet card not found');
      return { success: false, error: 'Faucet card not found' };
    }

    // Step 6: Click "Continue" trên thanh bar
    logger.info('Clicking Continue...');
    const continueBtn = await this._findOptional(driver, LOCATORS.continueButton, 5000);
    if (continueBtn) {
      await driver.executeScript('arguments[0].click();', continueBtn);
      await sleep(3000);
      logger.info('Continue clicked — modal opened');
    } else {
      logger.warn('Continue button not found — trying to proceed');
    }

    // Step 7: Nhập wallet address vào modal
    logger.info('Entering wallet address...');
    const addressInput = await this._findOptional(driver, LOCATORS.walletAddressInput, 5000);
    if (addressInput) {
      await addressInput.clear();
      await addressInput.sendKeys(address);
      await sleep(2000);
      logger.info('Wallet address entered');
    } else {
      logger.error('Wallet address input not found');
      return { success: false, error: 'Wallet address input not found' };
    }

    // Step 8: Chờ captcha + Click Send request
    // Cloudflare Turnstile captcha — không thể bypass
    // Chờ tối đa 60s cho user solve captcha thủ công (hoặc auto nếu lucky)
    logger.info('Waiting for captcha to be solved (up to 60s)...');
    const sendBtn = await this._findOptional(driver, LOCATORS.sendRequestButton, 60000);
    if (sendBtn) {
      // Kiểm tra button có enabled không
      const isEnabled = await sendBtn.isEnabled();
      if (isEnabled) {
        await driver.executeScript('arguments[0].click();', sendBtn);
        await sleep(5000);
        logger.info('Send request clicked — tokens should be dripping!');
      } else {
        logger.warn('Send request button is disabled — captcha may not be solved');
      }
    } else {
      logger.warn('Send request button not found — captcha blocking');
    }

    await sleep(5000);

    return {
      success: true,
      data: { network, address: `${address.slice(0, 8)}...`, captchaBlocked: !sendBtn },
    };
  }

  /**
   * Lấy wallet address từ MetaMask bằng cách navigate vào extension page.
   */
  async _getWalletAddress(driver, config, logger) {
    try {
      const extensionId = config.wallet?.extensionId;
      if (!extensionId) return null;

      // Navigate to MetaMask home to get account address
      await driver.get(`chrome-extension://${extensionId}/home.html`);
      await sleep(3000);

      // Thử lấy address từ DOM (MetaMask hiện address ở header)
      const addressEl = await this._findOptional(
        driver,
        By.xpath('//*[contains(@data-testid,"address") or contains(@class,"address")]'),
        5000
      );

      if (addressEl) {
        const text = await addressEl.getText();
        // MetaMask thường hiện dạng 0x1234...5678, cần click copy
        if (text && text.startsWith('0x')) {
          return text;
        }
      }

      // Fallback: dùng JS để query ethereum provider
      const address = await driver.executeScript(`
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          return accounts[0] || null;
        } catch { return null; }
      `);

      if (address) {
        logger.info('Got wallet address from ethereum provider');
        return address;
      }
    } catch (e) {
      logger.warn(`Could not get wallet address automatically: ${e.message}`);
    }
    return null;
  }

  async _dismissOverlays(driver, logger) {
    try {
      const closeButtons = await driver.findElements(
        By.xpath('//button[contains(@aria-label,"Close") or contains(@aria-label,"Dismiss")]')
      );
      for (const btn of closeButtons) {
        try {
          await driver.executeScript('arguments[0].click();', btn);
          logger.info('Dismissed overlay');
          await sleep(500);
        } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }

  async _waitFor(driver, locator, timeout = 10000) {
    const el = await driver.wait(until.elementLocated(locator), timeout);
    await driver.wait(until.elementIsVisible(el), timeout);
    return el;
  }

  async _findOptional(driver, locator, timeout = 3000) {
    try {
      return await this._waitFor(driver, locator, timeout);
    } catch {
      return null;
    }
  }
}
