import { Command } from 'commander';
import dotenv from 'dotenv';
import { loadConfig, ROOT_DIR } from './src/config/default.js';
import { initLogger } from './src/services/Logger.js';
import DataStore from './src/services/DataStore.js';
import GpmClient from './src/core/GpmClient.js';
import TaskRunner from './src/core/TaskRunner.js';
import { listTasks } from './src/tasks/index.js';

dotenv.config();

const program = new Command();

program
  .name('gpm-automation')
  .description('Multi-browser automation tool via GPM Login API')
  .version('1.0.0')
  .option('-t, --task <name>', 'Task to run')
  .option('-g, --group <groups>', 'Filter accounts by group (comma-separated)')
  .option('-p, --profiles <names>', 'Run specific profiles (comma-separated)')
  .option('-r, --range <range>', 'Run profile range (e.g. A0001-A0020)')
  .option('-c, --concurrent <number>', 'Max concurrent profiles', parseInt)
  .option('--resume', 'Resume failed accounts from last run')
  .option('--list-tasks', 'List available tasks')
  .option('--driver <type>', 'Browser driver: selenium or puppeteer');

program.parse();
const opts = program.opts();

// List tasks and exit
if (opts.listTasks) {
  console.log('\nAvailable tasks:\n');
  for (const t of listTasks()) {
    console.log(`  ${t.name.padEnd(20)} ${t.description}`);
  }
  console.log('');
  process.exit(0);
}

// Build config overrides from CLI
const overrides = {};
if (opts.task) overrides.execution = { ...overrides.execution, task: opts.task };
if (opts.concurrent) overrides.execution = { ...overrides.execution, maxConcurrent: opts.concurrent };
if (opts.driver) overrides.execution = { ...overrides.execution, driver: opts.driver };

const config = loadConfig(overrides);
const log = initLogger(config);

async function main() {
  log.info('=== GPM Automation Tool ===');
  log.info(`Task: ${config.execution.task} | Driver: ${config.execution.driver} | Concurrent: ${config.execution.maxConcurrent}`);

  const dataStore = new DataStore(config);
  const gpm = new GpmClient(config);

  // Step 1: Load accounts
  let accounts = dataStore.loadAccounts();

  // Step 2: Filter accounts (group first, then profiles/range)
  if (opts.group) {
    const groups = opts.group.split(',').map((s) => s.trim());
    accounts = dataStore.filterByGroup(accounts, groups);
  }
  if (opts.profiles) {
    const names = opts.profiles.split(',').map((s) => s.trim());
    accounts = dataStore.filterByProfiles(accounts, names);
  } else if (opts.range) {
    accounts = dataStore.filterByRange(accounts, opts.range);
  }

  if (opts.resume) {
    accounts = dataStore.filterResume(accounts, config.execution.task);
  }

  if (accounts.length === 0) {
    log.warn('No accounts to process. Check your Excel file or filter options.');
    process.exit(0);
  }

  log.info(`Accounts to process: ${accounts.length}`);

  // Step 3: Get GPM profiles — load from all relevant groups
  let gpmProfiles = [];
  try {
    // Collect unique gpm_group_ids from accounts (fallback to config.gpm.groupId)
    const groupIds = [...new Set(
      accounts.map(a => a.gpm_group_id || config.gpm.groupId).filter(Boolean)
    )];
    log.info(`Loading GPM profiles from groups: ${groupIds.join(', ')}`);

    for (const gid of groupIds) {
      const profiles = await gpm.getProfiles({ groupId: gid });
      // Tag each profile with its group ID for matching
      profiles.forEach(p => p._groupId = gid);
      gpmProfiles.push(...profiles);
    }
    log.info(`GPM profiles loaded: ${gpmProfiles.length}`);
  } catch (error) {
    log.error(`Failed to connect to GPM Login API: ${error.message}`);
    log.error('Make sure GPM Login is running.');
    process.exit(1);
  }

  // Step 4: Run tasks
  const runner = new TaskRunner(config);
  const results = await runner.run(accounts, gpmProfiles);

  // Step 5: Save results
  dataStore.saveResults(config.execution.task, results);

  log.info('=== Done ===');
}

main().catch((error) => {
  log.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
