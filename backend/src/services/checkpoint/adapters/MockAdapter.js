import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { BaseAdapter } from './BaseAdapter.js';
import { generatePassword, generateToken } from '../../../utils/secureToken.js';
import logger from '../../../utils/logger.js';

const dirName = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = path.resolve(dirName, '../../../../storage/artifacts');
fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

function sanitize(name) {
  return (
    name.replace(/[^A-Za-zА-Яа-яЁё0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'certificate'
  );
}

// Development-only adapter. Issues NOTHING real — it simulates the Check Point
// round-trip so the whole portal (frontend + backend + delivery) can be built
// and tested before the integration PoC is done.
export class MockAdapter extends BaseAdapter {
  constructor({ artifactType = 'p12' } = {}) {
    super();
    this.artifactType = artifactType;
  }

  async issue(request) {
    logger.warn('MockAdapter active — no real certificate is issued (development only).');
    await sleep(800); // simulate Check Point processing latency

    const commonName = request.fullName;

    if (this.artifactType === 'registration-key') {
      const registrationKey = generateToken(8).slice(0, 12).toUpperCase();
      return {
        type: 'registration-key',
        registrationKey,
        commonName,
        instructions:
          'Введите этот ключ регистрации в VPN-клиенте Check Point для загрузки сертификата.',
      };
    }

    // Produce a placeholder .p12 file so the download flow can be exercised.
    const password = generatePassword(20);
    const filePath = path.join(ARTIFACT_DIR, `${request.id}.p12`);
    // NOTE: this is NOT a valid PKCS#12 file. Placeholder for dev only.
    fs.writeFileSync(
      filePath,
      `PLACEHOLDER P12 for CN=${commonName} issued at ${new Date().toISOString()}\n`,
    );

    return {
      type: 'p12',
      filePath,
      fileName: `${sanitize(commonName)}.p12`,
      password,
      commonName,
    };
  }

  // eslint-disable-next-line class-methods-use-this
  async revoke() {
    await sleep(200);
    return { revoked: true };
  }
}
