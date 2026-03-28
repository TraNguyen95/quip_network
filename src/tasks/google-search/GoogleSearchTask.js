import { By, until, Key } from 'selenium-webdriver';
import BaseTask from '../BaseTask.js';
import { sleep, randomDelay, humanType } from '../../utils/humanBehavior.js';

const LOCATORS = {
  searchInput: By.name('q'),
  searchButton: By.name('btnK'),
};

export default class GoogleSearchTask extends BaseTask {
  static taskName = 'google-search';
  static description = 'Test task — Go to Google and search for a keyword';

  async execute(driver, account, { logger }) {
    const keyword = account.search_keyword || 'AI mới nhất';

    // Step 1: Navigate to Google
    logger.info('Navigating to Google...');
    await driver.get('https://www.google.com');
    await sleep(2000);

    // Step 2: Find search input and type keyword
    logger.info(`Searching for: "${keyword}"`);
    const searchInput = await driver.wait(
      until.elementLocated(LOCATORS.searchInput),
      10000
    );
    await searchInput.click();
    await humanType(searchInput, keyword);
    await randomDelay(1000, 2000);

    // Step 3: Submit search
    await searchInput.sendKeys(Key.RETURN);
    await sleep(3000);

    // Step 4: Get page title as result
    const title = await driver.getTitle();
    logger.info(`Search results page: ${title}`);

    // Step 5: Wait a bit to see results
    await sleep(5000);

    return { success: true, data: { keyword, pageTitle: title } };
  }
}
