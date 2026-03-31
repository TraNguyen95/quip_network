import { By, until } from 'selenium-webdriver';
import BaseTask from '../BaseTask.js';
import { sleep } from '../../utils/humanBehavior.js';

const getWebsiteUrl = () => process.env.QUIP_REFERRAL_URL || 'https://quest.quip.network/airdrop';

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
  goToAccountLink: By.xpath('//a[contains(.,"Go to Account")]'),
  followButton: By.xpath('(//button[.//span[text()="Follow"]])[1]'),
  claimButton: By.xpath('(//span[text()="Claim"])[1]'),
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
    logger.info(`Navigating to ${getWebsiteUrl()}`);
    await driver.get(getWebsiteUrl());
    await sleep(5000);

    // Update mainHandle to the Quip tab (unlock may have changed active tab)
    wallet.mainHandle = await driver.getWindowHandle();
    logger.info(`Main handle set to Quip tab: ${wallet.mainHandle.substring(0, 8)}`);

    // Step 3: Check if wallet already connected
    const needsConnect = await this._hasConnectButton(driver);

    if (needsConnect) {
      await this._connectWallet(driver, logger, wallet, walletPassword, walletType);
    } else {
      logger.info('Wallet already connected — skipping wallet connect');
    }

    // Check if "Go to Account" already visible → X already connected, skip Connect X
    const alreadyConnectedX = await this._findOptional(driver, LOCATORS.goToAccountLink, 3000);
    if (alreadyConnectedX) {
      logger.info('Go to Account found — X already connected, skipping Connect X');
    } else {
      // Step 4: Connect X (Twitter)
      await this._connectX(driver, logger);
    }

    // Step 6: Follow X account + Claim
    const claimed = await this._followAndClaim(driver, logger);

    // Step 7: Check in
    const checkedIn = await this._checkin(driver, logger);

    const pageSource = await driver.getPageSource();
    const walletConnected = !pageSource.includes('>Connect Wallet<') && !pageSource.includes('>Connect<');
    const xConnected = !pageSource.includes('Connect X');

    logger.info(`Result: wallet=${walletConnected}, x=${xConnected}, claimed=${claimed}, checkedIn=${checkedIn}`);
    return { success: claimed || checkedIn, data: { walletConnected, xConnected, claimed, checkedIn } };
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

      // Switch back to main and click "Log In" button
      await wallet.switchToMain();
      await sleep(3000);
      logger.info('Clicking Log In button...');
      const logInClicked = await driver.executeScript(`
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
          if (btn.textContent.trim() === 'Log In') { btn.click(); return true; }
        }
        return false;
      `);
      if (logInClicked) {
        logger.info('Clicked Log In');
      } else {
        logger.warn('Log In button not found');
      }
      await sleep(5000);

      // Handle sign message popup (2nd popup — needs 2 confirms)
      await this._handleWalletPopup(driver, logger, wallet, 'sign-1');
      await sleep(3000);
      await this._handleWalletPopup(driver, logger, wallet, 'sign-2');

      // // Reload after confirming OKX popup
      // logger.info('Reloading page after OKX confirm...');
      // await driver.navigate().refresh();
      // await sleep(5000);
    } else {
      logger.warn(`${walletType} button not found in modal`);
    }

    // // Verify
    // await driver.navigate().refresh();
    // await sleep(5000);
    // const connected = !(await this._hasConnectButton(driver));
    // if (connected) {
    //   logger.info('Wallet connected!');
    // } else {
    //   logger.warn('Wallet connect may have failed');
    // }
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

  // ==================== Follow X + Claim ====================

  async _followAndClaim(driver, logger) {
    // Click "Go to Account" link
    logger.info('Clicking Go to Account...');
    const goToBtn = await this._findOptional(driver, LOCATORS.goToAccountLink, 5000);
    if (!goToBtn) {
      logger.info('Go to Account button not found — skipping follow & claim');
      return false;
    }

    // Save main tab handle before clicking
    const mainHandle = await driver.getWindowHandle();
    await driver.executeScript('arguments[0].click();', goToBtn);
    await sleep(5000);

    // Switch to the new X tab
    const allHandles = await driver.getAllWindowHandles();
    const xTab = allHandles.find(h => h !== mainHandle);
    if (!xTab) {
      logger.warn('X tab not opened');
      return;
    }

    await driver.switchTo().window(xTab);
    const xUrl = await driver.getCurrentUrl();
    logger.info(`Switched to X tab: ${xUrl}`);

    // Wait for Follow button and click
    const followBtn = await this._findOptional(driver, LOCATORS.followButton, 10000);
    if (followBtn) {
      await driver.executeScript('arguments[0].click();', followBtn);
      logger.info('Clicked Follow');
      await sleep(3000);
    } else {
      logger.warn('Follow button not found — may already be following');
    }

    // Close X tab and switch back to main
    await driver.close();
    await driver.switchTo().window(mainHandle);
    logger.info('Closed X tab, back to main');
    await sleep(3000);

    // Click Claim button
    logger.info('Clicking Claim...');
    const claimBtn = await this._findOptional(driver, LOCATORS.claimButton, 5000);
    if (claimBtn) {
      await driver.executeScript('arguments[0].click();', claimBtn);
      logger.info('Clicked Claim');
      await sleep(3000);

      // Check for "Great job!" success message
      const greatJob = await this._findOptional(driver, By.xpath('//*[contains(text(),"Great job")]'), 10000);
      if (greatJob) {
        logger.info('Great job! — Claim successful');
        return true;
      } else {
        logger.warn('Great job! message not found after claim');
        return false;
      }
    } else {
      logger.warn('Claim button not found');
      return false;
    }
  }

  // ==================== Check In ====================

  async _checkin(driver, logger) {
    logger.info('Looking for Check in button...');
    const checkInBtn = await this._findOptional(driver, By.xpath("//*[text()='Check in']"), 10000);
    if (!checkInBtn) {
      logger.info('Check in button not found — may have already checked in today');
      return false;
    }

    await driver.executeScript('arguments[0].click();', checkInBtn);
    logger.info('Clicked Check in, waiting for result...');

    const success = await this._findOptional(driver, By.xpath("//*[text()='Check-In Succeeded!']"), 15000);
    if (success) {
      logger.info('Check-In Succeeded!');
      return true;
    }

    logger.warn('Check-In Succeeded! message not found');
    return false;
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
