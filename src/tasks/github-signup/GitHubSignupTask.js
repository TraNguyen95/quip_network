import { By, until } from 'selenium-webdriver';
import BaseTask from '../BaseTask.js';
import GemmmoEmailService from '../../services/GemmmoEmailService.js';
import { sleep } from '../../utils/humanBehavior.js';

const SIGNUP_URL = 'https://github.com/signup';

/**
 * GitHub Signup Task — Verified layout 2026-03-29
 *
 * GitHub signup is a SINGLE PAGE form (not multi-step):
 *   - "Continue with Google" / "Continue with Apple" buttons (DO NOT click these)
 *   - Email input (#email)
 *   - Password input (#password)
 *   - Username input (#login)
 *   - Country selector (pre-selected)
 *   - Marketing consent checkbox
 *   - "Create account" button (class: signup-form-fields__button)
 *   - Captcha (octocaptcha)
 *   - Email verification code page
 *
 * Excel columns: email, pass, profileName
 * Email service: gemmmo.vn API (get-email-code)
 */
export default class GitHubSignupTask extends BaseTask {
  static taskName = 'github-signup';
  static description = 'GitHub — register new account with email verification via gemmmo.vn';

  async execute(driver, account, { logger, humanBehavior, config }) {
    const { humanType } = humanBehavior;
    const email = account.email;
    const password = account.pass; // GitHub account password
    const emailApiPassword = account.wallet_password || account.pass; // gemmmo.vn email password

    if (!email || !password) {
      return { success: false, error: 'Missing email or pass in Excel' };
    }

    const base = email.split('@')[0].replace(/[^a-zA-Z0-9-]/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    const username = `${base}${rand}`;
    const gemmmo = new GemmmoEmailService();

    // Step 1: Switch to a real page tab (not extension background)
    await this._switchToPageTab(driver, logger);

    // Navigate to GitHub signup
    logger.info(`Navigating to ${SIGNUP_URL}`);
    await driver.get(SIGNUP_URL);
    await sleep(5000);

    // Step 2: Fill email
    logger.info(`Entering email: ${email}`);
    const emailInput = await this._waitForEl(driver, By.id('email'));
    await this._setInputValue(driver, emailInput, email);
    await sleep(1000);

    // Step 3: Fill password
    logger.info('Entering password...');
    const passwordInput = await this._waitForEl(driver, By.id('password'));
    await this._setInputValue(driver, passwordInput, password);
    await sleep(1000);

    // Step 4: Fill username
    logger.info(`Entering username: ${username}`);
    const usernameInput = await this._waitForEl(driver, By.id('login'));
    await this._setInputValue(driver, usernameInput, username);
    await sleep(2000);

    // Step 5: Click "Create account" (NOT "Continue with Google")
    logger.info('Clicking "Create account"...');
    const createClicked = await driver.executeScript(`
      const btns = document.querySelectorAll('button.signup-form-fields__button, button.js-octocaptcha-form-submit');
      for (const btn of btns) {
        if (btn.textContent.trim().includes('Create account') && btn.offsetParent !== null) {
          btn.scrollIntoView({ block: 'center' });
          btn.click();
          return true;
        }
      }
      // Fallback: any button with exact "Create account" text
      const all = document.querySelectorAll('button');
      for (const btn of all) {
        if (btn.textContent.trim() === 'Create account' && btn.offsetParent !== null) {
          btn.scrollIntoView({ block: 'center' });
          btn.click();
          return true;
        }
      }
      return false;
    `);
    if (!createClicked) {
      logger.warn('"Create account" button not found');
      return { success: false, error: '"Create account" button not found' };
    }
    logger.info('Clicked "Create account"');
    await sleep(3000);

    // Check if "select your country" error appears — re-select country and click again
    const hasCountryError = await driver.executeScript(`
      const text = document.body?.innerText || '';
      return text.includes('Select your country') || text.includes('select your country');
    `);
    if (hasCountryError) {
      logger.info('Country selection required — re-selecting country...');
      // Click the select to open it, pick current value or Vietnam
      const countrySelect = await this._findOptional(driver,
        By.css('select[autocomplete="country"], select[name="user_country"]'), 3000);
      if (countrySelect) {
        // Get current value, fallback to VN
        const currentVal = await countrySelect.getAttribute('value');
        const targetVal = currentVal || 'VN';
        // Use Selenium click + selectByValue to trigger proper events
        await countrySelect.click();
        await sleep(500);
        await driver.executeScript(`
          const sel = arguments[0];
          const val = arguments[1];
          // Re-select the same option to trigger validation
          for (const opt of sel.options) {
            if (opt.value === val) { opt.selected = true; break; }
          }
          sel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          sel.dispatchEvent(new Event('blur', { bubbles: true }));
        `, countrySelect, targetVal);
        logger.info(`Re-selected country: ${targetVal}`);
        await sleep(1000);
      }
      logger.info('Clicking "Create account" again...');
      await driver.executeScript(`
        const btns = document.querySelectorAll('button');
        for (const btn of btns) {
          if (btn.textContent.trim().includes('Create account') && btn.offsetParent !== null) {
            btn.click(); return;
          }
        }
      `);
      await sleep(5000);
    } else {
      await sleep(2000);
    }

    // Step 6: Handle captcha — wait for it to be solved (manual or auto)
    logger.info('Waiting for captcha/verification step...');
    await this._waitForCaptchaOrCode(driver, logger);

    // Step 7: Wait for verification code input
    logger.info('Waiting for verification code input...');
    const hasCodePage = await this._waitForCodePage(driver, 60000);
    if (!hasCodePage) {
      const currentUrl = await driver.getCurrentUrl();
      logger.warn(`Code page not found. URL: ${currentUrl}`);
      return { success: false, error: 'Verification code page not found' };
    }

    // Step 8: Wait 20s for email to arrive before calling API
    logger.info('Waiting 20s for GitHub to send verification email...');
    await sleep(20000);

    logger.info('Calling gemmmo.vn API to get verification code...');
    const code = await gemmmo.getEmailCode(email, emailApiPassword, 'github', 12, 5000);
    if (!code) {
      return { success: false, error: 'Failed to get verification code from gemmmo.vn' };
    }

    // Step 9: Input the code
    logger.info(`Entering verification code: ${code}`);
    await this._inputCode(driver, code, logger);
    await sleep(5000);

    // Step 10: Login if redirected to login page
    const urlAfterVerify = await driver.getCurrentUrl();
    logger.info(`URL after verify: ${urlAfterVerify}`);

    if (urlAfterVerify.includes('/login')) {
      logger.info('Redirected to login page — logging in...');
      await this._login(driver, email, password, emailApiPassword, logger, humanType);
    }

    // Step 11: Verify final result
    await sleep(3000);
    const finalUrl = await driver.getCurrentUrl();
    logger.info(`Final URL: ${finalUrl}`);
    const loggedIn = finalUrl.includes('github.com') && !finalUrl.includes('signup') && !finalUrl.includes('/login');

    if (loggedIn) {
      logger.info('GitHub account created and logged in!');
    } else {
      logger.warn('Signup done but login may not have completed');
    }

    return { success: true, data: { email, username, loggedIn, url: finalUrl } };
  }

  // ==================== Helpers ====================

  async _waitForCaptchaOrCode(driver, logger) {
    const maxWait = 120000;
    const interval = 3000;
    let elapsed = 0;

    while (elapsed < maxWait) {
      const currentUrl = await driver.getCurrentUrl();

      // If we're already past signup (verification page or dashboard)
      if (!currentUrl.includes('/signup')) {
        logger.info('Navigated away from signup page');
        return;
      }

      // Check for verification code page text
      const hasCode = await driver.executeScript(`
        const text = document.body?.innerText || '';
        return text.includes('Enter the code') || text.includes('verification code') || text.includes('enter code');
      `);
      if (hasCode) {
        logger.info('Verification code page detected');
        return;
      }

      // Check for captcha
      const hasCaptcha = await driver.executeScript(`
        return !!document.querySelector('iframe[src*="octocaptcha"], iframe[src*="captcha"], .js-octocaptcha-frame, [data-octocaptcha-token]');
      `);
      if (hasCaptcha && elapsed % 15000 === 0) {
        logger.info('Captcha detected — waiting for solve...');
      }

      // Check for errors on the form
      const error = await driver.executeScript(`
        const el = document.querySelector('.flash-error, .signup-form-error, [class*="error"]');
        return el?.textContent?.trim()?.substring(0, 200) || null;
      `);
      if (error && elapsed % 15000 === 0) {
        logger.warn(`Form error: ${error}`);
      }

      await sleep(interval);
      elapsed += interval;
    }
    logger.warn('Captcha wait timeout');
  }

  async _waitForCodePage(driver, timeout = 60000) {
    const endTime = Date.now() + timeout;
    while (Date.now() < endTime) {
      const found = await driver.executeScript(`
        const text = document.body?.innerText || '';
        if (text.includes('Enter the code') || text.includes('verification code') || text.includes('enter code') || text.includes('Enter code')) {
          return true;
        }
        // Check for code input elements
        const inputs = document.querySelectorAll('input[name*="otp"], input[autocomplete="one-time-code"], input[data-code-input]');
        return inputs.length > 0;
      `);
      if (found) return true;
      await sleep(2000);
    }
    return false;
  }

  async _inputCode(driver, code, logger) {
    // GitHub uses 8-digit individual inputs or a single input
    // Try individual digit inputs first
    const digitCount = await driver.executeScript(`
      const inputs = document.querySelectorAll('input[data-code-input], .js-verification-code-input-auto-submit input');
      return inputs.length;
    `);

    if (digitCount > 1) {
      logger.info(`Found ${digitCount} digit inputs`);
      for (let i = 0; i < code.length && i < digitCount; i++) {
        await driver.executeScript(`
          const inputs = document.querySelectorAll('input[data-code-input], .js-verification-code-input-auto-submit input');
          const inp = inputs[${i}];
          if (inp) {
            inp.focus();
            inp.value = '${code[i]}';
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
          }
        `);
        await sleep(150);
      }
    } else {
      // Single input or text-based input
      logger.info('Using single code input');
      const typed = await driver.executeScript(`
        const selectors = [
          'input[name*="otp"]', 'input[autocomplete="one-time-code"]',
          'input[data-code-input]', 'input[type="text"]'
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el && el.offsetParent !== null) {
            el.focus();
            el.value = '${code}';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
        return false;
      `);
      if (!typed) {
        // Fallback: find any visible text input on the page
        const inputs = await driver.findElements(By.css('input'));
        for (const inp of inputs) {
          try {
            if (await inp.isDisplayed()) {
              const type = await inp.getAttribute('type');
              if (!type || type === 'text' || type === 'number' || type === 'tel') {
                await inp.clear();
                await inp.sendKeys(code);
                logger.info('Typed code into fallback input');
                break;
              }
            }
          } catch {}
        }
      }
    }

    // Try clicking verify/submit
    await sleep(1000);
    await driver.executeScript(`
      const btns = document.querySelectorAll('button[type="submit"], button');
      for (const btn of btns) {
        const text = btn.textContent.trim().toLowerCase();
        if ((text.includes('verify') || text.includes('submit') || text.includes('continue')) && btn.offsetParent !== null) {
          btn.click();
          return;
        }
      }
    `);
  }

  async _login(driver, email, password, emailApiPassword, logger, humanType) {
    await sleep(3000);

    try {
      // Clear auto-filled values with Ctrl+A then type over
      const loginField = await this._waitForEl(driver, By.id('login_field'), 10000);
      await this._setInputValue(driver, loginField, email);
      await sleep(500);

      const passField = await this._waitForEl(driver, By.id('password'), 5000);
      await this._setInputValue(driver, passField, password);
      await sleep(500);

      // Click Sign in
      await driver.executeScript(`
        const btn = document.querySelector('input[type="submit"][value="Sign in"], button[type="submit"]');
        if (btn) btn.click();
      `);
      logger.info('Clicked Sign in');
      await sleep(5000);

      // Handle device verification if needed (GitHub may send another code)
      const currentUrl = await driver.getCurrentUrl();
      if (currentUrl.includes('sessions/verified-device') || currentUrl.includes('account_verifications')) {
        logger.info('Device verification required — waiting for code...');
        await sleep(20000);
        const gemmmo = (await import('../../services/GemmmoEmailService.js')).default;
        const g = new gemmmo();
        const deviceCode = await g.getEmailCode(email, emailApiPassword, 'github', 12, 5000);
        if (deviceCode) {
          logger.info(`Device verification code: ${deviceCode}`);
          await this._inputCode(driver, deviceCode, logger);
          await sleep(5000);
        }
      }
    } catch (e) {
      logger.warn(`Login error: ${e.message}`);
    }
  }

  async _switchToPageTab(driver, logger) {
    const handles = await driver.getAllWindowHandles();
    logger.info(`Window handles: ${handles.length}`);

    // Find existing page tab (chrome://new-tab-page/ or any non-extension tab)
    for (const h of handles) {
      await driver.switchTo().window(h);
      const url = await driver.getCurrentUrl();
      if (!url.startsWith('chrome-extension://') && !url.startsWith('about:blank')) {
        logger.info(`Switched to existing page tab: ${url.substring(0, 60)}`);
        return;
      }
    }

    // No page tab found — create new one
    logger.info('No page tab found, creating new tab');
    await driver.switchTo().newWindow('tab');
  }

  async _waitForEl(driver, locator, timeout = 10000) {
    const el = await driver.wait(until.elementLocated(locator), timeout);
    await driver.wait(until.elementIsVisible(el), timeout);
    return el;
  }

  async _findOptional(driver, locator, timeout = 3000) {
    try { return await this._waitForEl(driver, locator, timeout); }
    catch { return null; }
  }

  async _setInputValue(driver, element, value) {
    await driver.executeScript(`
      const el = arguments[0];
      el.focus();
      el.value = '';
      el.value = arguments[1];
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    `, element, value);
  }
}
