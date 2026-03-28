/**
 * Abstract base class for all automation tasks.
 *
 * To create a new task:
 * 1. Extend BaseTask
 * 2. Set static taskName and description
 * 3. Implement execute(driver, account, helpers)
 * 4. Register in src/tasks/index.js
 */
export default class BaseTask {
  static taskName = 'base';
  static description = 'Base task — do not use directly';

  /**
   * Called before execute(). Override for setup logic.
   */
  async setup(config) {
    // Override if needed
  }

  /**
   * Main task logic. Must be implemented by subclass.
   *
   * @param {object} driver - Raw browser driver (Selenium WebDriver or Puppeteer Browser)
   * @param {object} account - Account data row from Excel
   * @param {object} helpers - { wallet, humanBehavior, logger }
   * @returns {{ success: boolean, data?: object, error?: string }}
   */
  async execute(driver, account, helpers) {
    throw new Error(`${this.constructor.taskName}: execute() must be implemented`);
  }

  /**
   * Called after execute(). Override for cleanup logic.
   */
  async cleanup(driver) {
    // Override if needed
  }
}
