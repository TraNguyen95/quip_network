import { By, until } from 'selenium-webdriver';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import BaseTask from '../BaseTask.js';
import { sleep } from '../../utils/humanBehavior.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const POSTS_FILE = resolve(__dirname, 'posts.txt');

const getQuipUrl = (account) =>
  account?.quip_url || process.env.QUIP_REFERRAL_URL || 'https://quest.quip.network/airdrop';

function getRandomPost() {
  const lines = readFileSync(POSTS_FILE, 'utf-8')
    .split('\n')
    .map(l => l.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);
  return lines[Math.floor(Math.random() * lines.length)];
}

export default class QuipPostTask extends BaseTask {
  static taskName = 'quip-post';
  static description = 'Quip Network — post on X, submit link on Quip, claim reward';

  async execute(driver, account, { logger, wallet, config }) {
    const walletPassword = account.wallet_password || '';
    const walletType = (account.wallet_type || config.wallet?.type || 'metamask').toLowerCase();

    // Step 1: Unlock wallet
    logger.info(`Unlocking wallet (${walletType})...`);
    await wallet.unlock(walletPassword);

    // Step 2: Go to X and post
    const post = getRandomPost();
    logger.info(`Posting on X: "${post.substring(0, 60)}..."`);
    await driver.get('https://x.com/home');
    await sleep(15000);

    // Click compose area on timeline
    const composed = await this._composePost(driver, post, logger);
    if (!composed) {
      logger.warn('Failed to compose post on X');
      return { success: false, error: 'Failed to compose post' };
    }
    await sleep(2000);

    // Click Post button
    const posted = await driver.executeScript(`
      const btn = document.querySelector('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]');
      if (btn && !btn.disabled) { btn.click(); return true; }
      return false;
    `);
    if (!posted) {
      logger.warn('Post button not found');
      return { success: false, error: 'Post button not found' };
    }
    logger.info('Clicked Post button');
    await sleep(5000);

    // Dismiss "Got it" popup if present
    await driver.executeScript(`
      const btns = document.querySelectorAll('button, [role="button"]');
      for (const btn of btns) {
        if (btn.textContent.trim() === 'Got it') { btn.click(); return true; }
      }
      return false;
    `);
    await sleep(2000);

    // Step 3: Get latest tweet link from timeline (tweet just posted appears at top)
    let tweetLink = null;
    for (let i = 0; i < 5; i++) {
      tweetLink = await driver.executeScript(`
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        if (articles.length === 0) return null;
        const first = articles[0];
        // Try time link first
        const timeLink = first.querySelector('a[href*="/status/"] time')?.closest('a');
        if (timeLink) return timeLink.href;
        // Fallback: any link with /status/
        const statusLink = first.querySelector('a[href*="/status/"]');
        if (statusLink) return statusLink.href;
        return null;
      `);
      if (tweetLink) break;
      await sleep(3000);
    }
    if (!tweetLink) {
      logger.warn('Latest tweet link not found');
      return { success: false, error: 'Latest tweet link not found' };
    }
    if (!tweetLink.includes('?')) tweetLink += '?s=20';
    logger.info(`Latest tweet: ${tweetLink}`);

    // Step 4: Go to Quip
    const quipUrl = 'https://quest.quip.network/airdrop';
    logger.info(`Navigating to ${quipUrl}`);
    await driver.get(quipUrl);
    await sleep(5000);

    // Step 5: Click the correct "Submit Post" (Post about Quip on X Daily)
    logger.info('Clicking "Submit Post" for daily post quest...');
    const clickedSubmit = await driver.executeScript(`
      var btns = document.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].textContent.trim().indexOf('Submit Post') !== -1) {
          var card = btns[i].parentElement.parentElement.parentElement;
          if (card && card.innerText.indexOf('Post about Quip') !== -1) {
            btns[i].click();
            return true;
          }
        }
      }
      return false;
    `);
    if (!clickedSubmit) {
      logger.warn('"Submit Post" for daily quest not found');
      return { success: false, error: 'Submit Post button not found' };
    }
    await sleep(3000);

    // Step 6: Enter tweet link into input
    logger.info('Entering tweet link...');
    const linkInput = await this._findOptional(driver, By.id('contentUrl'), 10000);
    if (!linkInput) {
      logger.warn('contentUrl input not found');
      return { success: false, error: 'contentUrl input not found' };
    }
    // Focus input, clear, then sendKeys to trigger React state properly
    await driver.executeScript('arguments[0].scrollIntoView({block:"center"});', linkInput);
    await linkInput.click();
    await sleep(500);
    await linkInput.clear();
    await linkInput.sendKeys(tweetLink);
    await sleep(2000);

    // Step 7: Wait for Claim button to be enabled and click
    logger.info('Waiting for Claim button...');
    const claimed = await this._waitAndClickClaim(driver, logger);

    if (!claimed) {
      logger.warn('Claim failed');
      return { success: false, error: 'Claim button not found or not enabled' };
    }

    // Wait for "Great job!" message
    logger.info('Waiting for "Great job!" confirmation...');
    const greatJob = await this._waitForGreatJob(driver, logger);
    if (greatJob) {
      logger.info(`Great job! ${greatJob}`);
      return { success: true, data: { post: post.substring(0, 50), tweetLink, reward: greatJob } };
    }

    // Great job! not detected — reload and verify
    logger.info('Great job! not detected — reloading to verify...');
    await driver.get(quipUrl);
    await sleep(5000);

    // Check if Submit Post button still exists for daily quest
    const stillExists = await driver.executeScript(`
      var btns = document.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].textContent.trim().indexOf('Submit Post') !== -1) {
          var card = btns[i].parentElement.parentElement.parentElement;
          if (card && card.innerText.indexOf('Post about Quip') !== -1) return true;
        }
      }
      return false;
    `);

    if (!stillExists) {
      logger.info('Submit Post gone after reload — claim was successful');
      return { success: true, data: { post: post.substring(0, 50), tweetLink, verified: true } };
    }

    // Submit Post still there — retry submit
    logger.info('Submit Post still exists — retrying...');
    await driver.executeScript(`
      var btns = document.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        if (btns[i].textContent.trim().indexOf('Submit Post') !== -1) {
          var card = btns[i].parentElement.parentElement.parentElement;
          if (card && card.innerText.indexOf('Post about Quip') !== -1) { btns[i].click(); return; }
        }
      }
    `);
    await sleep(3000);

    const retryInput = await this._findOptional(driver, By.id('contentUrl'), 10000);
    if (retryInput) {
      await driver.executeScript('arguments[0].scrollIntoView({block:"center"});', retryInput);
      await retryInput.click();
      await sleep(500);
      await retryInput.clear();
      await retryInput.sendKeys(tweetLink);
      await sleep(2000);

      const retryClaimed = await this._waitAndClickClaim(driver, logger);
      if (retryClaimed) {
        const retryGreat = await this._waitForGreatJob(driver, logger);
        if (retryGreat) {
          logger.info(`Retry success! ${retryGreat}`);
          return { success: true, data: { post: post.substring(0, 50), tweetLink, reward: retryGreat } };
        }
      }
    }

    logger.warn('Retry claim also failed');
    return { success: false, error: 'Claim failed after retry' };
  }

  async _composePost(driver, text, logger) {
    // Wait for compose box to appear (X loads slowly)
    for (let i = 0; i < 10; i++) {
      const typed = await driver.executeScript(`
        const el = document.querySelector('[data-testid="tweetTextarea_0"]');
        if (!el) return false;
        el.focus();
        document.execCommand('insertText', false, arguments[0]);
        return true;
      `, text);

      if (typed) {
        logger.info('Composed post successfully');
        return true;
      }
      await sleep(3000);
    }

    logger.warn('tweetTextarea_0 not found after 30s');
    return false;
  }

  async _waitAndClickClaim(driver, logger) {
    const maxWait = 30000;
    const interval = 2000;
    let elapsed = 0;

    while (elapsed < maxWait) {
      const clicked = await driver.executeScript(`
        const spans = document.querySelectorAll('span.visible');
        for (const span of spans) {
          if (span.textContent.trim() === 'Claim') {
            const btn = span.closest('button');
            if (btn && !btn.disabled) {
              btn.click();
              return true;
            }
          }
        }
        // Fallback: any button containing Claim text
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
          if (btn.textContent.trim() === 'Claim' && !btn.disabled) {
            btn.click();
            return true;
          }
        }
        return false;
      `);
      if (clicked) return true;

      await sleep(interval);
      elapsed += interval;
      if (elapsed % 10000 === 0) logger.info('Still waiting for Claim button...');
    }
    return false;
  }

  async _waitForGreatJob(driver, logger) {
    const maxWait = 15000;
    const interval = 2000;
    let elapsed = 0;

    while (elapsed < maxWait) {
      const result = await driver.executeScript(`
        const spans = document.querySelectorAll('span');
        for (const s of spans) {
          if (s.textContent.trim() === 'Great job!') {
            const container = s.closest('div');
            return container ? container.innerText.trim() : 'Great job!';
          }
        }
        return null;
      `);
      if (result) return result;
      await sleep(interval);
      elapsed += interval;
    }
    return null;
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
