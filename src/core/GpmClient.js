import axios from 'axios';
import { getLogger } from '../services/Logger.js';

export default class GpmClient {
  constructor(config) {
    this.apiBase = config.gpm.apiBase;
    this.apiVersion = config.gpm.apiVersion; // 'v2' or 'v3'
    this.groupId = config.gpm.groupId;
    this.client = axios.create({
      baseURL: this.apiBase,
      timeout: 30000,
    });
  }

  get log() {
    return getLogger();
  }

  // ==================== V3 API ====================

  async getProfilesV3({ groupId, perPage = 100 } = {}) {
    const gid = groupId || this.groupId;
    let allProfiles = [];
    let page = 1;

    while (true) {
      const { data } = await this.client.get('/api/v3/profiles', {
        params: { group_id: gid, page, per_page: perPage, sort: 2 },
      });
      const profiles = data.data || [];
      allProfiles.push(...profiles);

      const totalPages = data.pagination?.total_page || 1;
      if (page >= totalPages) break;
      page++;
    }

    return allProfiles;
  }

  async startProfileV3(profileId, { width, height, x, y } = {}) {
    const params = {};
    if (width && height) params.win_size = `${width},${height}`;
    if (x !== undefined && y !== undefined) params.win_pos = `${x},${y}`;
    params.win_scale = 1;

    const { data } = await this.client.get(`/api/v3/profiles/start/${profileId}`, { params });

    if (!data.data) {
      throw new Error(`Failed to start profile ${profileId}: ${JSON.stringify(data)}`);
    }

    return {
      driverPath: data.data.driver_path,
      remoteAddress: data.data.remote_debugging_address,
      processId: data.data.process_id,
      profileId,
    };
  }

  async closeProfileV3(profileId) {
    await this.client.post(`/api/v3/profiles/close/${profileId}`);
  }

  // ==================== V2 API ====================

  async getProfilesV2() {
    const { data } = await this.client.get('/v2/profiles');
    return data || [];
  }

  async createProfileV2(name, { proxy = '', canvas = 'off' } = {}) {
    const { data } = await this.client.get('/v2/create', {
      params: { name, proxy, canvas },
    });
    return data;
  }

  async startProfileV2(profileId, { remoteDebugPort = 0 } = {}) {
    const params = { profile_id: profileId };
    if (remoteDebugPort > 0) params.remote_debug_port = remoteDebugPort;

    const { data } = await this.client.get('/v2/start', { params });

    return {
      driverPath: data.selenium_driver_location,
      remoteAddress: data.selenium_remote_debug_address,
      profileId: data.profile_id,
    };
  }

  async deleteProfileV2(profileId, mode = 2) {
    await this.client.get('/v2/delete', {
      params: { profile_id: profileId, mode },
    });
  }

  // ==================== Unified API ====================

  async getProfiles(options = {}) {
    if (this.apiVersion === 'v2') {
      return this.getProfilesV2();
    }
    return this.getProfilesV3(options);
  }

  async startProfile(profileId, windowOptions = {}) {
    const version = this.apiVersion;
    this.log.info(`Starting profile ${profileId} (API ${version})`, { profile: profileId });

    if (version === 'v2') {
      return this.startProfileV2(profileId, windowOptions);
    }
    return this.startProfileV3(profileId, windowOptions);
  }

  async closeProfile(profileId) {
    this.log.info(`Closing profile ${profileId}`, { profile: profileId });

    if (this.apiVersion === 'v2') {
      // V2 doesn't have a close endpoint — browser closes when driver quits
      return;
    }
    return this.closeProfileV3(profileId);
  }

  // Wait for browser WebSocket URL to be ready
  async waitForBrowser(remoteAddress, { maxRetries = 20, interval = 500 } = {}) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const url = `http://${remoteAddress}/json/version`;
        const { data } = await this.client.get(url, { timeout: 2000 });
        if (data.webSocketDebuggerUrl) {
          return data.webSocketDebuggerUrl;
        }
      } catch {
        // Browser not ready yet
      }
      await new Promise((r) => setTimeout(r, interval));
    }
    throw new Error(`Browser not ready after ${maxRetries * interval}ms at ${remoteAddress}`);
  }
}
