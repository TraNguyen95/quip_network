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
    // Support formats: A0001-A0020, P-20260329-0001-P-20260329-0020
    // Split on last occurrence of prefix boundary: find where end prefix+number starts
    // Strategy: extract trailing number from both sides
    const parts = rangeStr.split('-');

    // Try simple format first: PREFIX0001-PREFIX0020 (no dash in prefix)
    const simpleMatch = rangeStr.match(/^([A-Za-z]*)(\d+)-([A-Za-z]*)(\d+)$/);
    if (simpleMatch) {
      const prefix = simpleMatch[1];
      const start = parseInt(simpleMatch[2], 10);
      const end = parseInt(simpleMatch[4], 10);
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

    // Complex format: prefix-with-dashes-0001~prefix-with-dashes-0020 (~ separator)
    // Or auto-detect: split by finding two profile names that share a prefix
    // Extract trailing number from each account name, find range boundaries
    const trailingNum = (s) => { const m = s.match(/(\d+)$/); return m ? parseInt(m[1], 10) : null; };
    const prefixOf = (s) => { const m = s.match(/^(.*?)(\d+)$/); return m ? m[1] : null; };

    // Find the midpoint: try splitting rangeStr where the second prefix starts
    // e.g. "P-20260329-0001-P-20260329-0020" → find second "P-20260329-"
    const firstNum = trailingNum(rangeStr.split('-').slice(0, -1).join('-'))
      || trailingNum(parts.slice(0, Math.ceil(parts.length / 2)).join('-'));

    // Try to find prefix by matching against existing account names
    const sampleAccount = accounts.find(a => a.profileName && rangeStr.startsWith(prefixOf(a.profileName) || '###'));
    if (sampleAccount) {
      const prefix = prefixOf(sampleAccount.profileName);
      // Extract start and end numbers from rangeStr
      const rangeNums = rangeStr.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+).*${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`));
      if (rangeNums) {
        const start = parseInt(rangeNums[1], 10);
        const end = parseInt(rangeNums[2], 10);
        const filtered = accounts.filter((acc) => {
          if (!acc.profileName) return false;
          if (prefixOf(acc.profileName) !== prefix) return false;
          const num = trailingNum(acc.profileName);
          return num !== null && num >= start && num <= end;
        });
        this.log.info(`Filtered ${filtered.length}/${accounts.length} accounts for range: ${rangeStr}`);
        return filtered;
      }
    }

    this.log.error(`Invalid range format: ${rangeStr}. Expected: A0001-A0020 or P-20260329-0001-P-20260329-0020`);
    return accounts;
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
