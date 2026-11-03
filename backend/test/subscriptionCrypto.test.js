process.env.NODE_ENV = 'test';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptSubscription, decryptSubscription } from '../src/services/subscriptionCrypto.js';

const SECRET = 'test-enc-secret-0123456789';
const TOKEN = 'abcDEF1234567890abcDEF1234567890';

test('encrypt → decrypt round-trip восстанавливает исходник', () => {
  const plain = JSON.stringify({ dns: { servers: [{ address: 'https://1.1.1.1/dns-query' }] } });
  const blob = encryptSubscription(plain, TOKEN, SECRET);
  assert.match(blob, /^DOGMA1:/);
  assert.equal(decryptSubscription(blob, TOKEN, SECRET), plain);
});

test('блоб непрозрачен: в base64 нет DNS/адресов', () => {
  const plain = 'cloudflare-dns.com 8.8.8.8 vpn.example.com';
  const blob = encryptSubscription(plain, TOKEN, SECRET);
  const decoded = Buffer.from(blob.slice('DOGMA1:'.length), 'base64').toString('latin1');
  assert.ok(!decoded.includes('cloudflare'));
  assert.ok(!decoded.includes('8.8.8.8'));
  assert.ok(!decoded.includes('vpn.example.com'));
});

test('неверный секрет не расшифровывает', () => {
  const blob = encryptSubscription('secret payload', TOKEN, SECRET);
  assert.throws(() => decryptSubscription(blob, TOKEN, 'wrong-secret'));
});

test('неверный токен не расшифровывает', () => {
  const blob = encryptSubscription('secret payload', TOKEN, SECRET);
  assert.throws(() => decryptSubscription(blob, 'other-token', SECRET));
});

test('каждый вызов даёт разный блоб (случайный IV)', () => {
  const a = encryptSubscription('x', TOKEN, SECRET);
  const b = encryptSubscription('x', TOKEN, SECRET);
  assert.notEqual(a, b);
  assert.equal(decryptSubscription(a, TOKEN, SECRET), 'x');
  assert.equal(decryptSubscription(b, TOKEN, SECRET), 'x');
});
