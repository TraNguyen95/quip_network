import PQueue from 'p-queue';
import BrowserManager from './BrowserManager.js';
import { getTask } from '../tasks/index.js';
import { getLogger, profileLogger } from '../services/Logger.js';
import { createWalletHandler } from '../extensions/index.js';
import ProxyManager from '../services/ProxyManager.js';
import { retry } from '../utils/retry.js';
import * as humanBehavior from '../utils/humanBehavior.js';
import { sleep } from '../utils/humanBehavior.js';

export default class TaskRunner {
  constructor(config) {
    this.config = config;
    this.browserManager = new BrowserManager(config);
    this.proxyManager = new ProxyManager(config);
    this.results = [];
    this.activeProfiles = new Map(); // profileId → { browserDriver }
    this.isShuttingDown = false;

    this.queue = new PQueue({
      concurrency: config.execution.maxConcurrent,
    });

    // Graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  get log() {
    return getLogger();
  }

  /**
   * Run task on a list of accounts.
   * Each account is { profileName, profileId, email, pass, proxy, wallet_password, ... }
   */
  async run(accounts, gpmProfiles) {
    const taskName = this.config.execution.task;
    const task = getTask(taskName);
    await task.setup(this.config);

    this.log.info(`Starting task "${taskName}" on ${accounts.length} accounts (max concurrent: ${this.config.execution.maxConcurrent})`);

    // Add all accounts to queue
    let index = 0;
    for (const account of accounts) {
      const currentIndex = index++;
      const profileName = account.profileName;
      const accountGroupId = account.gpm_group_id || this.config.gpm.groupId;

      // Find GPM profile by name + group
      const gpmProfile = gpmProfiles.find(p => {
        const name = p.name || p.path;
        if (name !== profileName) return false;
        // If profile has tagged group, match it
        if (p._groupId && accountGroupId) return String(p._groupId) === String(accountGroupId);
        return true;
      });
      if (!gpmProfile) {
        this.log.warn(`GPM profile not found for "${profileName}", skipping`);
        this.results.push({
          profileName,
          status: 'fail',
          error: 'GPM profile not found',
          retries: 0,
          time: new Date().toISOString(),
        });
        continue;
      }

      const profileId = gpmProfile.id || gpmProfile.path;

      this.queue.add(() =>
        this.runSingleAccount(task, account, profileId, profileName, currentIndex)
      );
    }

    // Wait for all tasks to complete
    await this.queue.onIdle();

    // Cleanup
    await task.cleanup?.();

    // Summary
    const success = this.results.filter((r) => r.status === 'success').length;
    const fail = this.results.filter((r) => r.status === 'fail').length;
    this.log.info(`Completed: ${success} success, ${fail} fail out of ${this.results.length} total`);

    return this.results;
  }

  async runSingleAccount(task, account, profileId, profileName, index) {
    if (this.isShuttingDown) return;

    const pLog = profileLogger(this.log, profileName);
    const maxRetries = this.config.execution.retryOnFail;
    let retries = 0;

    const result = await retry(
      async (attempt) => {
        if (attempt > 0) {
          retries = attempt;
          pLog.warn(`Retry ${attempt}/${maxRetries}`);
        }

        let browserDriver;
        try {
          // Start profile and connect
          const connection = await this.browserManager.startAndConnect(profileId, index);
          browserDriver = connection.browserDriver;
          const rawDriver = connection.rawDriver;

          this.activeProfiles.set(profileId, { browserDriver });

          // Delay between profiles
          if (index > 0 && this.config.execution.delayBetweenProfiles > 0) {
            await sleep(this.config.execution.delayBetweenProfiles);
          }

          // Create wallet handler for this account
          const wallet = createWalletHandler(rawDriver, pLog, this.config, account);
          await wallet.saveMainHandle();

          // Get proxy info
          const proxy = this.proxyManager.getProxyForAccount(account);

          // Execute task
          const taskResult = await task.execute(rawDriver, account, {
            logger: pLog,
            humanBehavior,
            wallet,
            proxy,
            config: this.config,
          });

          return {
            profileName,
            profileId,
            status: taskResult.success ? 'success' : 'fail',
            data: taskResult.data || null,
            error: taskResult.error || null,
            retries,
            time: new Date().toISOString(),
          };
        } catch (error) {
          pLog.error(`Error: ${error.message}`);

          // Screenshot on error
          if (browserDriver) {
            await this.browserManager.screenshotOnError(browserDriver, profileName);
          }

          throw error;
        } finally {
          // Always close profile
          if (browserDriver) {
            this.activeProfiles.delete(profileId);
            await this.browserManager.closeAll(browserDriver, profileId);
          }
        }
      },
      {
        retries: maxRetries,
        baseDelay: 3000,
        onRetry: (err, attempt) => {
          pLog.warn(`Retry ${attempt}: ${err.message}`);
        },
      }
    ).catch((error) => {
      // All retries exhausted
      return {
        profileName,
        profileId,
        status: 'fail',
        error: error.message,
        retries,
        time: new Date().toISOString(),
      };
    });

    this.results.push(result);
    pLog.info(`${result.status.toUpperCase()} (retries: ${result.retries})`);
  }

  async shutdown() {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    this.log.warn('Shutting down... closing all browsers');
    this.queue.clear();

    // Close all active profiles
    const closePromises = [];
    for (const [profileId, { browserDriver }] of this.activeProfiles) {
      closePromises.push(this.browserManager.closeAll(browserDriver, profileId));
    }
    await Promise.allSettled(closePromises);
    this.activeProfiles.clear();

    this.log.info('All browsers closed. Exiting.');
    process.exit(0);
  }
}
