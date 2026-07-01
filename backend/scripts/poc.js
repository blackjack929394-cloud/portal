/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────────
// Check Point integration PoC / verification script (план, Этап 3).
//
// Run this against your REAL management server to confirm the exact command and
// field names BEFORE switching CERT_ISSUANCE_MODE away from "mock". It dumps the
// raw JSON so you can align src/services/checkpoint/payloads.js if anything
// differs on your version.
//
// Usage (reads connection details from .env):
//   npm run poc                          # safe: login + show-api-versions only
//   npm run poc -- --show-user <name>    # read-only: dump a user's certificates
//   npm run poc -- --issue-regkey <name> # issues a reg key on a TEST user
//   npm run poc -- --issue-p12 <name>    # issues a .p12 on a TEST user
//
// Use a throwaway TEST user for the --issue-* checks. Each issuing run publishes.
// ─────────────────────────────────────────────────────────────────────────────
import { CheckpointClient } from '../src/services/checkpoint/CheckpointClient.js';
import {
  buildRegistrationKeyPayload,
  buildP12Payload,
  buildShowUserPayload,
  findCertificateByComment,
  extractRegistrationKey,
  extractP12Base64,
} from '../src/services/checkpoint/payloads.js';
import config from '../src/config/index.js';

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

const dump = (label, obj) => {
  console.log(`\n===== ${label} =====`);
  console.log(JSON.stringify(obj, null, 2));
};

async function main() {
  if (!config.checkpoint.host) {
    console.error('CP_MGMT_HOST is not set. Fill in .env first.');
    process.exit(1);
  }
  if (!config.checkpoint.tlsVerify) {
    console.warn('WARNING: CP_MGMT_TLS_VERIFY is false — only acceptable for a lab PoC.');
  }

  const cp = new CheckpointClient();
  const showUser = arg('--show-user');
  const issueReg = arg('--issue-regkey');
  const issueP12 = arg('--issue-p12');

  try {
    await cp.login();
    console.log('Login OK. sid acquired.');
    dump('show-api-versions', await cp.call('show-api-versions', {}));

    if (showUser) {
      dump(`show-user ${showUser}`, await cp.call('show-user', buildShowUserPayload(showUser)));
    }

    if (issueReg) {
      const comment = `poc-regkey-${Date.now()}`;
      const setRes = await cp.call(
        'set-user',
        buildRegistrationKeyPayload({
          name: issueReg,
          comment,
          expirationDays: config.checkpoint.regKeyExpirationDays,
        }),
      );
      dump('set-user (registration-key) result', setRes);
      await cp.publish();
      const cert = findCertificateByComment(setRes, comment);
      console.log('\n>>> extracted registration-key:', extractRegistrationKey(cert || setRes));
    }

    if (issueP12) {
      const comment = `poc-p12-${Date.now()}`;
      const setRes = await cp.call(
        'set-user',
        buildP12Payload({ name: issueP12, password: 'PoCpass123!', comment }),
      );
      dump('set-user (certificate-file) result', setRes);
      await cp.publish();
      const b64 = extractP12Base64(setRes);
      console.log('\n>>> p12 base64 found:', b64 ? `yes (${b64.length} chars)` : 'NO');
      if (b64) {
        const fs = await import('node:fs');
        fs.writeFileSync('poc-output.p12', Buffer.from(b64.replace(/\s/g, ''), 'base64'));
        console.log('Wrote poc-output.p12 — verify with: openssl pkcs12 -info -in poc-output.p12');
      }
    }
  } catch (err) {
    console.error('\nPoC failed:', err.message);
    if (err.body) dump('error body', err.body);
    await cp.discard();
    process.exitCode = 1;
  } finally {
    await cp.logout();
  }
}

main();
