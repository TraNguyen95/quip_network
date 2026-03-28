import MetaMaskHandler from './MetaMaskHandler.js';
import OKXHandler from './OKXHandler.js';

/**
 * Wallet extension IDs (Chrome Web Store defaults).
 * User can override via config.wallet.extensionId
 */
const DEFAULT_EXTENSION_IDS = {
  metamask: 'njifadofgijamiddalklhbfielmgnpgn',
  okx: 'oaonnfepgafchfeggefgljggcbeejddn',
};

/**
 * Create the correct wallet handler based on config.
 *
 * @param {object} driver - Selenium WebDriver instance
 * @param {object} logger - Logger instance
 * @param {object} config - Full config object
 * @param {object} account - Account data (may override wallet type per account)
 * @returns {BaseWalletHandler}
 */
export function createWalletHandler(driver, logger, config, account = {}) {
  // Account-level override > config-level
  const walletType = (account.wallet_type || config.wallet?.type || 'metamask').toLowerCase();
  // Only use config.wallet.extensionId if wallet type matches config type
  const configType = (config.wallet?.type || 'metamask').toLowerCase();
  const extensionId = account.wallet_extension_id
    || (walletType === configType ? config.wallet?.extensionId : null)
    || DEFAULT_EXTENSION_IDS[walletType]
    || DEFAULT_EXTENSION_IDS.metamask;

  switch (walletType) {
    case 'okx':
      return new OKXHandler(driver, logger, extensionId);

    case 'metamask':
    default:
      return new MetaMaskHandler(driver, logger, extensionId);
  }
}
