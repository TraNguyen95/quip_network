/**
 * Human-like behavior utilities for browser automation.
 * These helpers add randomness to actions to avoid bot detection.
 */

export function randomDelay(min = 500, max = 1500) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Selenium: type text character by character with random delays
export async function humanType(element, text, minDelay = 80, maxDelay = 200) {
  for (const char of text) {
    await element.sendKeys(char);
    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    await new Promise((r) => setTimeout(r, delay));
  }
}

// Selenium: click with small random pause before clicking
export async function humanClick(driver, element) {
  const actions = driver.actions({ async: true });
  await actions.move({ origin: element }).pause(100 + Math.random() * 200).click().perform();
}

// Selenium: scroll page randomly
export async function randomScroll(driver, times = 3) {
  for (let i = 0; i < times; i++) {
    const scrollAmount = Math.floor(Math.random() * 200) + 100;
    await driver.executeScript(`window.scrollBy(0, ${scrollAmount})`);
    await randomDelay(500, 1500);
  }
}

// Selenium: wait for element with timeout
export async function waitForElement(driver, locator, timeout = 10000) {
  const { until } = await import('selenium-webdriver');
  const element = await driver.wait(until.elementLocated(locator), timeout);
  await driver.wait(until.elementIsVisible(element), timeout);
  return element;
}

// Selenium: find element without throwing (returns null if not found)
export async function findOptionalElement(driver, locator, timeout = 3000) {
  try {
    const { until } = await import('selenium-webdriver');
    return await driver.wait(until.elementLocated(locator), timeout);
  } catch {
    return null;
  }
}
