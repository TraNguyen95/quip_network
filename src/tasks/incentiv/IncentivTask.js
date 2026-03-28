import { By, until } from 'selenium-webdriver';
import BaseTask from '../BaseTask.js';
import MetaMaskHandler from '../../extensions/MetaMaskHandler.js';
import { sleep } from '../../utils/humanBehavior.js';
import { randomInt } from '../../utils/helpers.js';

const WEBSITE_URL = 'https://testnet.incentiv.net';

const LOCATORS = {
  metamaskButton: By.xpath('//button[@tabindex="0"]/p[text()="MetaMask"]'),
  getTestnetTokensButton: By.xpath(
    "//button[not(contains(@class, 'opacity-50')) and p[contains(text(), 'Get Testnet Tokens')]]"
  ),
  getTokensButton: By.xpath('//p[text()="Get Tokens"]'),
  closeButton: By.xpath('//p[text()="Close"]'),
  sendBtn: By.xpath('(//button[text()="SEND"])[1]'),
  swapBtn: By.xpath('(//button[text()="SWAP"])[1]'),
  inputAmount: By.xpath('//input[@placeholder="Input amount"]'),
  inputAmountForSwap: By.xpath('//input[@placeholder="From amount"]'),
  inputSearch: By.xpath('(//input[@placeholder="Search..."])[2]'),
  confirmSendButton: By.xpath("//button[p[contains(text(), 'Confirm')]]"),
  selectItemForSwap: By.xpath('//span[text()="Select an item"]'),
  BULL: By.xpath('//li[text()="BULL"]'),
  FLIP: By.xpath('//li[text()="FLIP"]'),
};

export default class IncentivTask extends BaseTask {
  static taskName = 'incentiv';
  static description = 'Incentiv testnet — get tokens, send, swap';

  async execute(driver, account, { logger, config }) {
    const walletPassword = account.wallet_password || config.wallet?.password || '';
    const extensionId = config.wallet?.extensionId;

    const metamask = new MetaMaskHandler(driver, logger, extensionId);
    await metamask.saveMainHandle();

    // Step 1: Unlock MetaMask
    await metamask.unlock(walletPassword);

    // Step 2: Navigate to Incentiv
    logger.info(`Navigating to ${WEBSITE_URL}`);
    await driver.get(WEBSITE_URL);
    await sleep(3000);

    // Step 3: Connect wallet (if connect button exists)
    const connectBtn = await this._findOptional(driver, LOCATORS.metamaskButton);
    if (connectBtn) {
      logger.info('Connecting wallet...');
      const handlesBefore = await driver.getAllWindowHandles();
      await connectBtn.click();
      await sleep(2000);
      await metamask.confirmTransaction(handlesBefore);
      await metamask.switchToMain();
      logger.info('Wallet connected');
    }

    // Step 4: Get testnet tokens
    logger.info('Attempting to get testnet tokens...');
    const getTokenBtn = await this._findOptional(driver, LOCATORS.getTestnetTokensButton);
    if (getTokenBtn) {
      await getTokenBtn.click();

      const finalBtn = await this._waitFor(driver, LOCATORS.getTokensButton, 30000);
      await finalBtn.click();
      logger.info('Requested tokens');

      const closeBtn = await this._findOptional(driver, LOCATORS.closeButton, 30000);
      if (closeBtn) {
        await sleep(2000);
        await closeBtn.click();
      }
    } else {
      logger.info('Get tokens button not found, skipping');
    }

    // Step 5: Send tokens (if enabled in account data or config)
    const isSendToken = account.isSendToken === 1 || account.isSendToken === '1';
    if (isSendToken) {
      await this._sendTokens(driver, account, metamask, logger);
    }

    // Step 6: Swap tokens (if enabled)
    const isSwapToken = account.isSwapToken === 1 || account.isSwapToken === '1';
    if (isSwapToken) {
      await this._swapTokens(driver, metamask, logger);
    }

    await sleep(5000);
    return { success: true, data: { sent: isSendToken, swapped: isSwapToken } };
  }

  async _sendTokens(driver, account, metamask, logger) {
    logger.info('Sending tokens...');

    const sendBtn = await this._findOptional(driver, LOCATORS.sendBtn);
    if (!sendBtn) {
      logger.warn('Send button not found');
      return;
    }
    await sendBtn.click();

    const inputAmount = await this._findOptional(driver, LOCATORS.inputAmount);
    if (inputAmount) {
      await inputAmount.clear();
      await inputAmount.sendKeys(String(randomInt(10, 30)));
      await sleep(3000);
    }

    // Input recipient address (from account data)
    const inputSearch = await this._findOptional(driver, LOCATORS.inputSearch);
    if (inputSearch && account.send_to_address) {
      await inputSearch.sendKeys(account.send_to_address);
      await sleep(2000);
    }

    // Confirm send
    const confirmBtn = await this._findOptional(driver, LOCATORS.confirmSendButton);
    if (confirmBtn) {
      const handlesBefore = await driver.getAllWindowHandles();
      await confirmBtn.click();
      await metamask.confirmTransaction(handlesBefore);
      await metamask.switchToMain();
      logger.info('Tokens sent');
      await sleep(10000);
    }
  }

  async _swapTokens(driver, metamask, logger) {
    logger.info('Swapping tokens...');

    const swapBtn = await this._findOptional(driver, LOCATORS.swapBtn);
    if (!swapBtn) {
      logger.warn('Swap button not found');
      return;
    }
    await swapBtn.click();

    const inputAmount = await this._findOptional(driver, LOCATORS.inputAmountForSwap);
    if (inputAmount) {
      await inputAmount.click();
      await sleep(2000);
      await inputAmount.clear();
      await sleep(2000);
      await inputAmount.sendKeys(String(randomInt(10, 30)));
      await sleep(3000);
    }

    // Select swap token
    const selectItem = await this._findOptional(driver, LOCATORS.selectItemForSwap);
    if (selectItem) {
      await selectItem.click();
      await sleep(2000);

      const bull = await this._findOptional(driver, LOCATORS.BULL);
      if (bull) {
        await bull.click();
      } else {
        const flip = await this._findOptional(driver, LOCATORS.FLIP);
        if (flip) await flip.click();
      }
      await sleep(3000);
    }

    // Confirm swap
    const confirmBtn = await this._findOptional(driver, LOCATORS.confirmSendButton);
    if (confirmBtn) {
      const handlesBefore = await driver.getAllWindowHandles();
      await confirmBtn.click();
      await metamask.confirmTransaction(handlesBefore);
      await metamask.switchToMain();
      logger.info('Tokens swapped');
      await sleep(5000);
    }
  }

  // ==================== Helpers ====================

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
