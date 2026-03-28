import BaseTask from '../BaseTask.js';

/**
 * Example task template.
 * Copy this file to create a new airdrop task.
 */
export default class ExampleTask extends BaseTask {
  static taskName = 'example';
  static description = 'Example task — navigates to a URL and takes a screenshot';

  async execute(driver, account, { logger, humanBehavior }) {
    const { randomDelay } = humanBehavior;

    logger.info(`Running example task for ${account.profileName}`);

    // Navigate to target website
    await driver.get('https://example.com');
    await randomDelay(2000, 3000);

    // Get page title
    const title = await driver.getTitle();
    logger.info(`Page title: ${title}`);

    return { success: true, data: { title } };
  }
}
