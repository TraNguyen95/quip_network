import { Builder, Browser } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { writeFileSync } from 'fs';
import BrowserDriver from './BrowserDriver.js';

export default class SeleniumDriver extends BrowserDriver {
  constructor() {
    super();
    this.driver = null;
  }

  async connect(driverPath, remoteAddress) {
    const service = new chrome.ServiceBuilder(driverPath);

    const options = new chrome.Options();
    options.debuggerAddress(remoteAddress);

    this.driver = await new Builder()
      .forBrowser(Browser.CHROME)
      .setChromeService(service)
      .setChromeOptions(options)
      .build();

    return this.driver;
  }

  async navigateTo(url) {
    await this.driver.get(url);
  }

  async quit() {
    if (this.driver) {
      try {
        await this.driver.quit();
      } catch {
        // Driver may already be closed
      }
      this.driver = null;
    }
  }

  async screenshot(filepath) {
    if (!this.driver) return;
    const image = await this.driver.takeScreenshot();
    writeFileSync(filepath, image, 'base64');
  }

  getRawDriver() {
    return this.driver;
  }
}
