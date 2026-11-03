import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guestRegisterSchema } from '../src/validators/authValidators.js';

test('accepts valid Cyrillic full name + email', () => {
  const r = guestRegisterSchema.safeParse({ fullName: 'Иванов Иван Иванович', email: 'i@dogma.ru' });
  assert.ok(r.success);
});

test('rejects too-short name', () => {
  assert.equal(guestRegisterSchema.safeParse({ fullName: 'И', email: 'i@dogma.ru' }).success, false);
});

test('rejects forbidden characters', () => {
  assert.equal(guestRegisterSchema.safeParse({ fullName: 'Ivan <script>', email: 'i@dogma.ru' }).success, false);
});

test('email is required for guests', () => {
  assert.equal(guestRegisterSchema.safeParse({ fullName: 'Ivan Ivanov' }).success, false);
});

test('rejects bad email', () => {
  assert.equal(guestRegisterSchema.safeParse({ fullName: 'Ivan Ivanov', email: 'nope' }).success, false);
});