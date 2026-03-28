/**
 * Abstract interface for browser drivers.
 * Both SeleniumDriver and PuppeteerDriver implement this interface.
 */
export default class BrowserDriver {
  async connect(driverPath, remoteAddress) {
    throw new Error('connect() must be implemented');
  }

  async navigateTo(url) {
    throw new Error('navigateTo() must be implemented');
  }

  async quit() {
    throw new Error('quit() must be implemented');
  }

  async screenshot(filepath) {
    throw new Error('screenshot() must be implemented');
  }

  // Return the underlying driver instance (selenium WebDriver or puppeteer Browser)
  getRawDriver() {
    throw new Error('getRawDriver() must be implemented');
  }
}
