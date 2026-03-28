import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import process from 'process';

// Compatible with both ESM and CJS (esbuild bundle)
let ROOT_DIR;
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  ROOT_DIR = resolve(__dirname, '..', '..');
} catch {
  ROOT_DIR = process.cwd();
}

const defaults = {
  gpm: {
    apiBase: 'http://127.0.0.1:19995',
    apiVersion: 'v3',
    groupId: 11,
  },
  execution: {
    maxConcurrent: 5,
    driver: 'selenium',
    task: 'example',
    retryOnFail: 2,
    delayBetweenProfiles: 2000,
  },
  window: {
    width: 500,
    height: 700,
    screenWidth: 2560,
    screenHeight: 1440,
    margin: 10,
  },
  wallet: {
    type: 'metamask',
    extensionId: 'nkbihfbeogaeaoehlefnkodbefgpgknn',
  },
  data: {
    accountsFile: 'data/accounts.xlsx',
    resultsDir: 'results',
  },
  logging: {
    level: 'info',
    logDir: 'logs',
    consoleColor: true,
  },
};

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object'
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

export function loadConfig(overrides = {}) {
  let userConfig = {};
  const configPath = resolve(ROOT_DIR, 'config.json');

  if (existsSync(configPath)) {
    try {
      userConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch (e) {
      console.error(`[Config] Failed to parse config.json: ${e.message}`);
    }
  }

  const config = deepMerge(defaults, userConfig);
  return deepMerge(config, overrides);
}

export { ROOT_DIR };
