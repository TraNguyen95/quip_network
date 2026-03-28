import axios from 'axios';
import { getLogger } from './Logger.js';

/**
 * 2FA TOTP service.
 * Fetches TOTP codes from a remote API or generates locally.
 */
export default class TwoFAService {
  constructor(apiUrl = 'https://2fa.live/tok') {
    this.apiUrl = apiUrl;
  }

  get log() {
    return getLogger();
  }

  /**
   * Get TOTP code from remote API.
   * @param {string} secret - TOTP secret key
   * @returns {string|null} The 6-digit TOTP code
   */
  async getCode(secret) {
    if (!secret) return null;

    try {
      const { data } = await axios.get(`${this.apiUrl}/${secret}`, { timeout: 10000 });
      // API returns { token: "123456" } or plain text
      const code = typeof data === 'object' ? data.token : String(data).trim();
      return code;
    } catch (error) {
      this.log.error(`2FA error for secret ${secret.slice(0, 4)}***: ${error.message}`);
      return null;
    }
  }
}
