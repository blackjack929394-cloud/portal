import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BaseAdapter } from './BaseAdapter.js';
import { CheckpointClient } from '../CheckpointClient.js';
import { deriveUsername, ensureUser } from '../userResolver.js';
import { buildP12Payload, extractP12Base64 } from '../payloads.js';
import { generatePassword } from '../../../utils/secureToken.js';
import config from '../../../config/index.js';
import logger from '../../../utils/logger.js';

const dirName = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = path.resolve(dirName, '../../../../storage/artifacts');
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

function sanitize(name) {
  return name.replace(/[^A-Za-zА-Яа-яЁё0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'certificate';
}

// PKCS#12 file flow.
// The ICA generates a .p12 (with private key); the Management API returns it as
// base64 in the set-user result. We decode it to disk; the orchestration layer
// delivers the file + the password (out-of-band) over one-time links.
//
// ⚠️ Version note: base64 p12 export had a known bug on R80.30/R80.40/R81 fixed
//    via JHF. Confirm with `npm run poc -- --issue-p12 <testuser>` and openssl
//    before enabling this mode in production.
export class P12Adapter extends BaseAdapter {
  constructor(clientOpts = {}) {
    super();
    this.clientFactory = () => new CheckpointClient(clientOpts);
  }

  async issue(request) {
    const cp = this.clientFactory();
    const username = deriveUsername(request);
    const comment = `portal-${request.id}`;
    const password = generatePassword(20);
    try {
      await cp.login();
      await ensureUser(cp, { username, email: request.email });

      const setRes = await cp.call(
        'set-user',
        buildP12Payload({
          name: username,
          password,
          comment,
          validityDays: config.checkpoint.certValidityDays,
        }),
      );
      await cp.publish();

      const base64 = extractP12Base64(setRes);
      if (!base64) {
        throw new Error(
          'PKCS#12 base64 not found in Check Point response — verify with `npm run poc` (and check JHF level).',
        );
      }

      const filePath = path.join(ARTIFACT_DIR, `${request.id}.p12`);
      fs.writeFileSync(filePath, Buffer.from(base64.replace(/\s/g, ''), 'base64'));

      logger.info({ requestId: request.id, username }, 'Check Point: .p12 issued');
      return {
        type: 'p12',
        filePath,
        fileName: `${sanitize(request.fullName)}.p12`,
        password,
        commonName: request.fullName,
      };
    } catch (err) {
      await cp.discard();
      throw err;
    } finally {
      await cp.logout();
    }
  }
}
