import { BaseAdapter } from './BaseAdapter.js';
import { CheckpointClient } from '../CheckpointClient.js';
import { deriveUsername, ensureUser } from '../userResolver.js';
import {
  buildRegistrationKeyPayload,
  buildShowUserPayload,
  findCertificateByComment,
  extractRegistrationKey,
} from '../payloads.js';
import config from '../../../config/index.js';
import logger from '../../../utils/logger.js';

// Registration key flow (recommended, most reliable on Check Point).
// 1) ensure the internal user object exists
// 2) add a certificate with a unique comment -> generates a registration key
// 3) publish
// 4) read the user's certificates back and pick ours by the unique comment
//
// The user enters this key in the Remote Access VPN client, which then completes
// enrollment against the ICA over SSL.
export class RegistrationKeyAdapter extends BaseAdapter {
  constructor(clientOpts = {}) {
    super();
    this.clientFactory = () => new CheckpointClient(clientOpts);
  }

  async issue(request) {
    const cp = this.clientFactory();
    const username = deriveUsername(request);
    const comment = `portal-${request.id}`;
    try {
      await cp.login();
      await ensureUser(cp, { username, email: request.email });

      const setRes = await cp.call(
        'set-user',
        buildRegistrationKeyPayload({
          name: username,
          comment,
          expirationDays: config.checkpoint.regKeyExpirationDays,
        }),
      );
      await cp.publish();

      // Prefer the key from the set-user result; fall back to a fresh show-user.
      let cert = findCertificateByComment(setRes, comment);
      let registrationKey = cert ? extractRegistrationKey(cert) : extractRegistrationKey(setRes);

      if (!registrationKey) {
        const showRes = await cp.call('show-user', buildShowUserPayload(username));
        cert = findCertificateByComment(showRes, comment) || showRes;
        registrationKey = extractRegistrationKey(cert);
      }

      if (!registrationKey) {
        throw new Error(
          'Registration key not found in Check Point response — verify field names with `npm run poc`.',
        );
      }

      logger.info({ requestId: request.id, username }, 'Check Point: registration key issued');
      return {
        type: 'registration-key',
        registrationKey,
        commonName: request.fullName,
        instructions:
          'Введите этот ключ регистрации в VPN-клиенте Check Point для загрузки сертификата.',
      };
    } catch (err) {
      await cp.discard();
      throw err;
    } finally {
      await cp.logout();
    }
  }
}
