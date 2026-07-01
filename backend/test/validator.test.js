import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequestSchema } from '../src/validators/certificateRequest.js';

test('accepts valid Cyrillic full name', () => {
  const r = createRequestSchema.safeParse({ fullName: 'Иванов Иван Иванович' });
  assert.ok(r.success);
});

test('accepts optional valid email', () => {
  const r = createRequestSchema.safeParse({ fullName: 'Ivan Ivanov', email: 'i@dogma.ru' });
  assert.ok(r.success);
});

test('rejects too-short name', () => {
  assert.equal(createRequestSchema.safeParse({ fullName: 'И' }).success, false);
});

test('rejects forbidden characters', () => {
  assert.equal(createRequestSchema.safeParse({ fullName: 'Ivan <script>' }).success, false);
});

test('rejects bad email', () => {
  assert.equal(
    createRequestSchema.safeParse({ fullName: 'Ivan Ivanov', email: 'nope' }).success,
    false,
  );
});
