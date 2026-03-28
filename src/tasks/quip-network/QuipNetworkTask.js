import { By, until } from 'selenium-webdriver';
import BaseTask from '../BaseTask.js';
import { sleep } from '../../utils/humanBehavior.js';

const WEBSITE_URL = 'https://quest.quip.network/airdrop';

/**
 * Flow verified qua Playwright MCP inspect GPM browser (2026-03-28):
 *
 * CONNECT WALLET (OKX / MetaMask):
 * 1. Unlock wallet (OKX or MetaMask depending on account config)
 * 2. Navigate to quest.quip.network/airdrop
 * 3. Click "Connect Wallet" / "Connect" (responsive text)
 * 4. Modal "Sign in" → Click "Connect with Ethereum" (data-testid="ConnectButton")
 * 5. Modal "Log in or sign up" (Dynamic.xyz) → wallet list in Shadow DOM
 * 6. Wallet popup → Connect → then Sign message popup → Confirm
 * 7. Wallet connected → quests unlock
 *
 * CONNECT X (Twitter):
 * 8. Click "Connect X" button (appears after wallet connected)
 * 9. Redirect to x.com/i/oauth2/authorize (X OAuth2)
 * 10. Click "Authorize app" on X page
 * 11. Redirect back to Quip → X connected → 25 points
 *
 * NOTE: X account must be logged in on the GPM browser profile beforehand.
 */

const LOCATORS = {
  connectWithEthereum: By.css('[data-testid="ConnectButton"]'),
  connectWithEthereumFallback: By.xpath('//button[contains(.,"Connect with Ethereum")]'),
  connectXButton: By.xpath('//button[contains(text(),"Connect X")]'),
  authorizeAppButton: By.xpath('//button[contains(.,"Authorize app")]'),
};

export default class QuipNetworkTask extends BaseTask {
  static taskName = 'quip-network';
  static description = 'Quip Network — connect wallet + connect X (Twitter)';

  async execute(driver, account, { logger, wallet, config }) {
    const walletPassword = account.wallet_password || '';
    const walletType = (account.wallet_type || config.wallet?.type || 'metamask').toLowerCase();

    // Step 1: Unlock MetaMask
    logger.info(`Unlocking wallet (${walletType})...`);
    await wallet.unlock(walletPassword);

    // Step 2: Navigate to Quip
    logger.info(`Navigating to ${WEBSITE_URL}`);
    await driver.get(WEBSITE_URL);
    await sleep(5000);

    // Step 3: Check if wallet already connected
    const needsConnect = await this._hasConnectButton(driver);

    if (needsConnect) {
      await this._connectWallet(driver, logger, wallet, walletPassword, walletType);
    } else {
      logger.info('Wallet already connected — skipping wallet connect');
    }

    // Step 4: Connect X (Twitter)
    await this._connectX(driver, logger);

    // Step 5: Verify final state
    await driver.navigate().refresh();
    await sleep(5000);

    const pageSource = await driver.getPageSource();
    const walletConnected = !pageSource.includes('>Connect Wallet<') && !pageSource.includes('>Connect<');
    // After X connected, button changes from "Connect X" to something else (e.g. "Verify" or disappears)
    const xConnected = !pageSource.includes('Connect X');

    logger.info(`Result: wallet=${walletConnected}, x=${xConnected}`);
    return { success: true, data: { walletConnected, xConnected } };
  }

  // ==================== Connect Wallet ====================

  async _connectWallet(driver, logger, wallet, walletPassword, walletType = 'metamask') {
    logger.info(`Connecting wallet (${walletType})...`);

    // Click Connect Wallet via JS
    const clicked = await driver.executeScript(`
      const els = document.querySelectorAll('*');
      for (const el of els) {
        const t = el.textContent.trim();
        if ((t === 'Connect Wallet' || t === 'Connect') && el.children.length === 0) {
          el.click(); return true;
        }
      }
      return false;
    `);
    if (!clicked) {
      logger.warn('Connect Wallet button not found');
      return;
    }
    await sleep(3000);

    // Click "Connect with Ethereum"
    logger.info('Clicking Connect with Ethereum...');
    let ethBtn = await this._findOptional(driver, LOCATORS.connectWithEthereum, 5000);
    if (!ethBtn) ethBtn = await this._findOptional(driver, LOCATORS.connectWithEthereumFallback, 3000);
    if (ethBtn) {
      await driver.executeScript('arguments[0].click();', ethBtn);
      await sleep(3000);
    }

    // Click wallet option in Dynamic.xyz modal (MetaMask or OKX)
    logger.info(`Selecting ${walletType} in modal...`);
    await sleep(2000);
    const walletClicked = await this._clickWalletInModal(driver, walletType);

    if (walletClicked) {
      logger.info(`Clicked ${walletType}`);
      await sleep(5000);

      // Handle wallet connect popup (1st popup)
      await this._handleWalletPopup(driver, logger, wallet, 'connect');

      // Wait for possible sign message popup (2nd popup)
      await sleep(5000);
      await this._handleWalletPopup(driver, logger, wallet, 'sign');
    } else {
      logger.warn(`${walletType} button not found in modal`);
    }

    // Verify
    await driver.navigate().refresh();
    await sleep(5000);
    const connected = !(await this._hasConnectButton(driver));
    if (connected) {
      logger.info('Wallet connected!');
    } else {
      logger.warn('Wallet connect may have failed');
    }
  }

  // ==================== Connect X (Twitter) ====================

  async _connectX(driver, logger) {
    // Check if "Connect X" button exists
    const connectXBtn = await this._findOptional(driver, LOCATORS.connectXButton, 5000);
    if (!connectXBtn) {
      logger.info('Connect X button not found — X may already be connected or wallet not connected');
      return;
    }

    logger.info('Clicking Connect X...');
    // Use JS click + also try finding by text (button may not match standard selector)
    let xClicked = await driver.executeScript(`
      const btns = document.querySelectorAll('button');
      for (const btn of btns) {
        if (btn.textContent.trim() === 'Connect X') { btn.click(); return true; }
      }
      const els = document.querySelectorAll('*');
      for (const el of els) {
        if (el.textContent.trim() === 'Connect X' && el.children.length === 0) {
          el.click(); return true;
        }
      }
      return false;
    `);
    if (!xClicked) {
      await driver.executeScript('arguments[0].click();', connectXBtn);
    }
    await sleep(5000);

    // Should redirect to x.com/i/oauth2/authorize
    const currentUrl = await driver.getCurrentUrl();
    if (currentUrl.includes('x.com') || currentUrl.includes('twitter.com')) {
      logger.info('Redirected to X OAuth page');

      // Click "Authorize app"
      const authorizeBtn = await this._findOptional(driver, LOCATORS.authorizeAppButton, 10000);
      if (authorizeBtn) {
        await driver.executeScript('arguments[0].click();', authorizeBtn);
        logger.info('Clicked Authorize app — X connecting...');
        await sleep(8000);

        // Should redirect back to Quip
        const newUrl = await driver.getCurrentUrl();
        if (newUrl.includes('quip.network')) {
          logger.info('Redirected back to Quip — X connected!');
        } else {
          logger.info(`Current URL: ${newUrl}`);
        }
      } else {
        // User may not be logged in on X
        logger.warn('Authorize button not found — user may not be logged in on X');
      }
    } else {
      logger.info(`Not redirected to X. Current URL: ${currentUrl}`);
    }
  }

  // ==================== Helpers ====================

  async _handleWalletPopup(driver, logger, wallet, label = 'popup') {
    const handlesBefore = [wallet.mainHandle];
    const allHandles = await driver.getAllWindowHandles();
    // Check if there's a new popup window beyond the main tab
    const newHandles = allHandles.filter(h => h !== wallet.mainHandle);
    if (newHandles.length === 0) {
      logger.info(`No ${label} popup found`);
      return false;
    }

    logger.info(`${label} popup detected (${newHandles.length} extra windows)`);
    try {
      await wallet.confirmTransaction(handlesBefore);
      await wallet.switchToMain();
      logger.info(`${label} popup handled`);
      return true;
    } catch (e) {
      logger.warn(`${label} popup handling failed: ${e.message}`);
      await wallet.switchToMain();
      return false;
    }
  }

  async _hasConnectButton(driver) {
    return driver.executeScript(`
      const els = document.querySelectorAll('*');
      for (const el of els) {
        const t = el.textContent.trim();
        if ((t === 'Connect Wallet' || t === 'Connect') && el.children.length === 0) return true;
      }
      return false;
    `);
  }

  async _clickWalletInModal(driver, walletType = 'metamask') {
    const walletNames = {
      metamask: ['MetaMask', 'metamask'],
      okx: ['OKX', 'okx', 'OKX Wallet'],
    };
    const keywords = walletNames[walletType] || walletNames.metamask;
    const altKeyword = walletType;

    // Try shadow DOM first (Dynamic.xyz renders wallet list in shadow DOM)
    let clicked = await driver.executeScript(`
      const keywords = ${JSON.stringify(keywords)};
      for (const host of document.querySelectorAll('*')) {
        if (host.shadowRoot) {
          for (const btn of host.shadowRoot.querySelectorAll('button')) {
            for (const kw of keywords) {
              if (btn.textContent.includes(kw)) { btn.click(); return true; }
            }
          }
        }
      }
      return false;
    `);
    if (clicked) return true;

    // Try main document buttons
    clicked = await driver.executeScript(`
      const keywords = ${JSON.stringify(keywords)};
      const btns = document.querySelectorAll('button');
      for (const btn of btns) {
        for (const kw of keywords) {
          if (btn.textContent.includes(kw)) { btn.click(); return true; }
        }
      }
      return false;
    `);
    if (clicked) return true;

    // Try iframes
    const iframes = await driver.findElements(By.tagName('iframe'));
    for (const iframe of iframes) {
      try {
        await driver.switchTo().frame(iframe);
        for (const kw of keywords) {
          const btns = await driver.findElements(By.xpath(`//button[contains(.,"${kw}")]`));
          if (btns.length > 0) {
            await driver.executeScript('arguments[0].click();', btns[0]);
            await driver.switchTo().defaultContent();
            return true;
          }
        }
        await driver.switchTo().defaultContent();
      } catch { try { await driver.switchTo().defaultContent(); } catch {} }
    }

    // Try img alt attribute (shadow DOM included)
    clicked = await driver.executeScript(`
      // Main DOM
      let imgs = document.querySelectorAll('img[alt*="${altKeyword}" i]');
      for (const img of imgs) {
        const btn = img.closest('button') || img.parentElement;
        if (btn) { btn.click(); return true; }
      }
      // Shadow DOM
      for (const host of document.querySelectorAll('*')) {
        if (host.shadowRoot) {
          imgs = host.shadowRoot.querySelectorAll('img[alt*="${altKeyword}" i]');
          for (const img of imgs) {
            const btn = img.closest('button') || img.parentElement;
            if (btn) { btn.click(); return true; }
          }
        }
      }
      return false;
    `);
    return clicked;
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
