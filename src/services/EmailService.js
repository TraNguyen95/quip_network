import axios from 'axios';
import { getLogger } from './Logger.js';

/**
 * Email service to fetch OTP/verification codes via OAuth2 email API.
 */
export default class EmailService {
  constructor(apiUrl = 'https://tools.dongvanfb.net/api/get_messages_oauth2') {
    this.apiUrl = apiUrl;
  }

  get log() {
    return getLogger();
  }

  /**
   * Fetch latest email messages for an account.
   * @param {object} account - Must have: email, refresh_token, client_id
   * @param {number} maxResults - Max messages to fetch
   * @returns {Array} List of messages
   */
  async getMessages(account, maxResults = 5) {
    try {
      const { data } = await axios.post(this.apiUrl, {
        email: account.email,
        refresh_token: account.refresh_token,
        client_id: account.client_id,
        max_results: maxResults,
      });
      return data.messages || data || [];
    } catch (error) {
      this.log.error(`EmailService error for ${account.email}: ${error.message}`);
      return [];
    }
  }

  /**
   * Extract verification code from email body using regex.
   * @param {string} body - Email body HTML
   * @param {RegExp} pattern - Regex with capture group for the code
   * @returns {string|null} The code or null
   */
  extractCode(body, pattern = /<div class="verification-code">(\d+)<\/div>/) {
    const match = body.match(pattern);
    return match ? match[1] : null;
  }

  /**
   * Extract href link from email body.
   * @param {string} body - Email body HTML
   * @param {RegExp} pattern - Regex with capture group for the URL
   * @returns {string|null} The URL or null
   */
  extractLink(body, pattern = /href="(https?:\/\/[^"]+)"/) {
    const match = body.match(pattern);
    return match ? match[1] : null;
  }
}
