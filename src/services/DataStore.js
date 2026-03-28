import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import XLSX from 'xlsx';
import { ROOT_DIR } from '../config/default.js';
import { getLogger } from './Logger.js';

export default class DataStore {
  constructor(config) {
    this.accountsFile = resolve(ROOT_DIR, config.data.accountsFile);
    this.resultsDir = resolve(ROOT_DIR, config.data.resultsDir);

    if (!existsSync(this.resultsDir)) {
      mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  get log() {
    return getLogger();
  }

  // ==================== Excel Reading ====================

  loadAccounts() {
    if (!existsSync(this.accountsFile)) {
      this.log.warn(`Accounts file not found: ${this.accountsFile}`);
      return [];
    }

    const workbook = XLSX.readFile(this.accountsFile);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    this.log.info(`Loaded ${rows.length} accounts from ${this.accountsFile}`);
    return rows;
  }

  // ==================== Filtering ====================

  filterByGroup(accounts, groups) {
    if (!groups || groups.length === 0) return accounts;

    const groupSet = new Set(groups.map((g) => g.toLowerCase().trim()));
    const filtered = accounts.filter(
      (acc) => acc.group && groupSet.has(acc.group.toLowerCase().trim())
    );

    this.log.info(`Filtered ${filtered.length}/${accounts.length} accounts for groups: ${groups.join(', ')}`);
    return filtered;
  }

  filterByProfiles(accounts, profileNames) {
    if (!profileNames || profileNames.length === 0) return accounts;

    const nameSet = new Set(profileNames.map((n) => n.trim()));
    const filtered = accounts.filter(
      (acc) => acc.profileName && nameSet.has(acc.profileName.trim())
    );

    this.log.info(`Filtered ${filtered.length}/${accounts.length} accounts for profiles: ${profileNames.join(', ')}`);
    return filtered;
  }

  filterByRange(accounts, rangeStr) {
    // Format: A0001-A0020
    const match = rangeStr.match(/^([A-Za-z]*)(\d+)-([A-Za-z]*)(\d+)$/);
    if (!match) {
      this.log.error(`Invalid range format: ${rangeStr}. Expected: A0001-A0020`);
      return accounts;
    }

    const prefix = match[1];
    const start = parseInt(match[2], 10);
    const end = parseInt(match[4], 10);

    const filtered = accounts.filter((acc) => {
      if (!acc.profileName) return false;
      const m = acc.profileName.match(/^([A-Za-z]*)(\d+)$/);
      if (!m || m[1] !== prefix) return false;
      const num = parseInt(m[2], 10);
      return num >= start && num <= end;
    });

    this.log.info(`Filtered ${filtered.length}/${accounts.length} accounts for range: ${rangeStr}`);
    return filtered;
  }

  filterResume(accounts, taskName) {
    const lastResult = this.getLatestResult(taskName);
    if (!lastResult || lastResult.length === 0) {
      this.log.warn('No previous results found for resume. Running all accounts.');
      return accounts;
    }

    const failedProfiles = new Set(
      lastResult.filter((r) => r.status === 'fail').map((r) => r.profileName)
    );

    const filtered = accounts.filter(
      (acc) => acc.profileName && failedProfiles.has(acc.profileName)
    );

    this.log.info(`Resume: ${filtered.length} failed accounts from last run`);
    return filtered;
  }

  // ==================== Results ====================

  saveResults(taskName, results) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${taskName}_${timestamp}.json`;
    const filepath = resolve(this.resultsDir, filename);

    writeFileSync(filepath, JSON.stringify(results, null, 2), 'utf-8');
    this.log.info(`Results saved to ${filepath}`);

    // Also save as latest
    const latestPath = resolve(this.resultsDir, `${taskName}_latest.json`);
    writeFileSync(latestPath, JSON.stringify(results, null, 2), 'utf-8');

    return filepath;
  }

  getLatestResult(taskName) {
    const latestPath = resolve(this.resultsDir, `${taskName}_latest.json`);
    if (!existsSync(latestPath)) return null;

    try {
      return JSON.parse(readFileSync(latestPath, 'utf-8'));
    } catch {
      return null;
    }
  }
}
