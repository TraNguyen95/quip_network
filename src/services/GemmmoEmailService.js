import axios from 'axios';
import { getLogger } from './Logger.js';

const API_BASE = 'https://gemmmo.vn/api';

/**
 * Gemmmo.vn email service — get verification codes via API.
 * Docs: https://gemmmo.vn/api/documentation
 *
 * NOTE: /api/email/get-email-code endpoint returns 422 (broken as of 2026-03-29).
 * Workaround: use /api/email/getEmailContentByEmail + parse code from email body.
 */
export default class GemmmoEmailService {
  constructor(apiBase = API_BASE) {
    this.apiBase = apiBase;
  }

  get log() {
    return getLogger();
  }

  /**
   * Get email verification code by fetching inbox and parsing latest email.
   * @param {string} email
   * @param {string} password - gemmmo.vn account password
   * @param {string} type - hint for which sender to look for (e.g. "github")
   * @param {number} retries
   * @param {number} delayMs
   * @returns {string|null} verification code or null
   */
  async getEmailCode(email, password, type, retries = 10, delayMs = 5000) {
    const senderHints = {
      github: { from: 'github', subjectKeywords: ['launch code', 'verification', 'code'], codePattern: /\b(\d{6,8})\b/ },
      facebook: { from: 'facebook', subjectKeywords: ['code', 'verification'], codePattern: /\b(\d{5,8})\b/ },
      default: { from: '', subjectKeywords: ['code', 'verification', 'otp'], codePattern: /\b(\d{4,8})\b/ },
    };
    const hint = senderHints[type] || senderHints.default;

    for (let i = 0; i < retries; i++) {
      try {
        this.log.info(`[GemmmoEmail] Attempt ${i + 1}/${retries} — getting code for ${email} (type: ${type})`);
        const emails = await this.getEmailContent(email, password);

        if (emails && emails.length > 0) {
          // API returns newest first — find the most relevant email
          const relevant = emails.find((e) => {
            const from = (e.from || '').toLowerCase();
            const subject = (e.subject || '').toLowerCase();
            return from.includes(hint.from) || hint.subjectKeywords.some((kw) => subject.includes(kw));
          }) || emails[0];

          if (relevant) {
            // Extract code from text body
            const body = relevant.text || relevant.html || '';
            const match = body.match(hint.codePattern);
            if (match) {
              this.log.info(`[GemmmoEmail] Got code: ${match[1]} (from: ${relevant.from}, subject: ${relevant.subject})`);
              return match[1];
            }
            this.log.info(`[GemmmoEmail] Email found but no code matched. Subject: ${relevant.subject}`);
          }
        } else {
          this.log.info(`[GemmmoEmail] No emails yet`);
        }
      } catch (error) {
        const msg = error.response?.data?.message || error.message;
        this.log.warn(`[GemmmoEmail] Error: ${msg}`);
      }
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    this.log.error(`[GemmmoEmail] Failed to get code after ${retries} attempts`);
    return null;
  }

  /**
   * Get all available domains.
   */
  async getAllDomains() {
    try {
      const { data } = await axios.get(`${this.apiBase}/getAllDomain`);
      return data.data || [];
    } catch (error) {
      this.log.error(`[GemmmoEmail] getAllDomains error: ${error.message}`);
      return [];
    }
  }

  /**
   * Get email content (full inbox).
   */
  async getEmailContent(email, password) {
    try {
      const { data } = await axios.post(
        `${this.apiBase}/email/getEmailContentByEmail`,
        { email, password },
        { headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' } },
      );
      return data.data || null;
    } catch (error) {
      this.log.error(`[GemmmoEmail] getEmailContent error: ${error.message}`);
      return null;
    }
  }

  /**
   * Delete email inbox.
   */
  async deleteEmailContent(email, password, _id) {
    try {
      const { data } = await axios.delete(`${this.apiBase}/email/deleteEmailContent`, {
        data: { email, password, _id },
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      });
      return data.status;
    } catch (error) {
      this.log.error(`[GemmmoEmail] deleteEmailContent error: ${error.message}`);
      return false;
    }
  }
}
