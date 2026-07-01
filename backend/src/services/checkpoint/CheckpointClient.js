import https from 'node:https';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

export class CheckpointApiError extends Error {
  constructor(command, statusCode, body) {
    super(
      `Check Point API error on '${command}' (HTTP ${statusCode}): ${
        body?.message || 'unknown error'
      }`,
    );
    this.name = 'CheckpointApiError';
    this.statusCode = statusCode;
    this.body = body;
  }
}

// Minimal client for the Check Point Management Web API (R80.10+).
// Common endpoints:
//   POST /web_api/login
//   POST /web_api/<command>
//   POST /web_api/publish
//   POST /web_api/logout
//
// Built on node:https (no extra deps) with a TLS-verify toggle. In production
// CP_MGMT_TLS_VERIFY must be true and the management CA must be trusted.
export class CheckpointClient {
  constructor(opts = {}) {
    this.host = opts.host ?? config.checkpoint.host;
    this.port = opts.port ?? config.checkpoint.port;
    this.user = opts.user ?? config.checkpoint.user;
    this.password = opts.password ?? config.checkpoint.password;
    this.apiKey = opts.apiKey ?? config.checkpoint.apiKey;
    this.tlsVerify = opts.tlsVerify ?? config.checkpoint.tlsVerify;
    this.domain = opts.domain ?? config.checkpoint.domain;
    this.sid = null;
  }

  request(command, payload = {}, { auth = true } = {}) {
    const body = JSON.stringify(payload);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    };
    if (auth && this.sid) headers['X-chkp-sid'] = this.sid;

    const options = {
      host: this.host,
      port: this.port,
      path: `/web_api/${command}`,
      method: 'POST',
      headers,
      rejectUnauthorized: this.tlsVerify,
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsed;
          try {
            parsed = data ? JSON.parse(data) : {};
          } catch {
            reject(new Error(`Invalid JSON from Check Point: ${data.slice(0, 200)}`));
            return;
          }
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
          else reject(new CheckpointApiError(command, res.statusCode, parsed));
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  async login() {
    const payload = this.apiKey
      ? { 'api-key': this.apiKey }
      : { user: this.user, password: this.password };
    if (this.domain) payload.domain = this.domain;
    const res = await this.request('login', payload, { auth: false });
    this.sid = res.sid;
    logger.info('Check Point: logged in');
    return res;
  }

  async call(command, payload = {}) {
    if (!this.sid) await this.login();
    return this.request(command, payload);
  }

  async publish() {
    return this.call('publish', {});
  }

  async discard() {
    try {
      return await this.call('discard', {});
    } catch {
      return null; // best effort
    }
  }

  async logout() {
    if (!this.sid) return;
    try {
      await this.request('logout', {});
    } finally {
      this.sid = null;
      logger.info('Check Point: logged out');
    }
  }
}
