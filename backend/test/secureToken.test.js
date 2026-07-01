import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateToken, generatePassword } from '../src/utils/secureToken.js';

test('generateToken is url-safe and unique', () => {
  const a = generateToken(32);
  const b = generateToken(32);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(a, b);
});

test('generatePassword respects length', () => {
  assert.equal(generatePassword(20).length, 20);
  assert.equal(generatePassword(8).length, 8);
});
