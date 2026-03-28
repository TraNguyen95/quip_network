/**
 * Abstract base class for wallet extension handlers.
 * Subclasses implement unlock, connect, confirm for specific wallets.
 */
export default class BaseWalletHandler {
  constructor(driver, logger) {
    this.driver = driver;
    this.log = logger;
    this.mainHandle = null;
  }

  async saveMainHandle() {
    this.mainHandle = await this.driver.getWindowHandle();
  }

  async switchToMain() {
    if (this.mainHandle) {
      await this.driver.switchTo().window(this.mainHandle);
    }
  }

  /**
   * Wait for a new popup window and switch to it.
   * @param {string[]} handlesBefore - Window handles before the action that triggers popup
   * @param {number} timeout - Max wait time in ms
   * @returns {string|null} The popup handle, or null
   */
  async waitAndSwitchToPopup(handlesBefore, timeout = 15000) {
    const { until } = await import('selenium-webdriver');

    await this.driver.wait(async () => {
      const current = await this.driver.getAllWindowHandles();
      return current.length > handlesBefore.length;
    }, timeout);

    const allHandles = await this.driver.getAllWindowHandles();
    const popupHandle = allHandles.find((h) => !handlesBefore.includes(h));

    if (popupHandle) {
      await this.driver.switchTo().window(popupHandle);
      return popupHandle;
    }
    return null;
  }

  // Must be implemented by subclass
  async unlock(password) {
    throw new Error('unlock() must be implemented');
  }

  async confirmTransaction() {
    throw new Error('confirmTransaction() must be implemented');
  }
}
