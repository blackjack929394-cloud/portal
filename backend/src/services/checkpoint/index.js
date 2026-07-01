import config from '../../config/index.js';
import logger from '../../utils/logger.js';
import { MockAdapter } from './adapters/MockAdapter.js';
import { RegistrationKeyAdapter } from './adapters/RegistrationKeyAdapter.js';
import { P12Adapter } from './adapters/P12Adapter.js';

export function createCheckpointAdapter() {
  switch (config.cert.mode) {
    case 'registration-key':
      return new RegistrationKeyAdapter();
    case 'p12':
      return new P12Adapter();
    case 'mock':
    default:
      if (config.env === 'production') {
        // Safety guard: never run mock issuance in production.
        logger.error('CERT_ISSUANCE_MODE=mock in production — refusing to start.');
        throw new Error('Mock certificate issuance is not allowed in production.');
      }
      return new MockAdapter({ artifactType: 'registration-key' });
  }
}
