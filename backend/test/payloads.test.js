import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRegistrationKeyPayload,
  buildP12Payload,
  findCertificateByComment,
  extractRegistrationKey,
  extractP12Base64,
} from '../src/services/checkpoint/payloads.js';

test('registration-key payload has expected nesting', () => {
  const p = buildRegistrationKeyPayload({ name: 'u', comment: 'portal-1', expirationDays: 14 });
  assert.equal(p.name, 'u');
  assert.equal(p.certificates.add['registration-key']['expiration-days'], 14);
  assert.equal(p.certificates.add['registration-key'].comment, 'portal-1');
});

test('p12 payload includes password and optional validity', () => {
  const p = buildP12Payload({ name: 'u', password: 'x', comment: 'c', validityDays: 30 });
  assert.equal(p.certificates.add['certificate-file'].password, 'x');
  assert.equal(p.certificates.add['certificate-file']['validity-days'], 30);
});

test('findCertificateByComment picks the right cert among many', () => {
  const resp = {
    user: {
      certificates: [
        { comment: 'old', 'registration-key': 'OLD' },
        { comment: 'portal-1', 'registration-key': 'NEW' },
      ],
    },
  };
  const cert = findCertificateByComment(resp, 'portal-1');
  assert.equal(extractRegistrationKey(cert), 'NEW');
});

test('extractP12Base64 finds nested base64 blob', () => {
  const b64 = 'MII'.padEnd(200, 'A');
  const resp = { result: { certificates: [{ comment: 'portal-1', file: b64 }] } };
  assert.equal(extractP12Base64(resp), b64);
});

test('extractP12Base64 returns null when absent', () => {
  assert.equal(extractP12Base64({ a: 'short' }), null);
});
