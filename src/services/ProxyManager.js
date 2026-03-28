import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { ROOT_DIR } from '../config/default.js';
import { formatProxyForGpm } from '../utils/helpers.js';
import { getLogger } from './Logger.js';

export default class ProxyManager {
  constructor(config) {
    this.proxies = [];
    this.proxyIndex = 0;

    // Load proxies from file if exists
    const proxyFile = resolve(ROOT_DIR, 'data', 'proxies.txt');
    if (existsSync(proxyFile)) {
      this.proxies = readFileSync(proxyFile, 'utf-8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
    }
  }

  get log() {
    return getLogger();
  }

  /**
   * Get proxy for an account.
   * Priority: account.proxy from Excel → proxies.txt round-robin → null
   */
  getProxyForAccount(account) {
    // 1. From Excel column
    if (account.proxy && account.proxy.trim()) {
      return formatProxyForGpm(account.proxy.trim());
    }

    // 2. From proxies.txt (round-robin)
    if (this.proxies.length > 0) {
      const proxy = this.proxies[this.proxyIndex % this.proxies.length];
      this.proxyIndex++;
      return formatProxyForGpm(proxy);
    }

    // 3. No proxy — GPM will use whatever is configured on the profile
    return null;
  }
}
