import { hkdfSync, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';

// Зашифрованный формат подписки для десктоп-клиента Dogma.
//
// Задача: ссылку/содержимое подписки нельзя расшифровать и посмотреть
// (DNS-серверы, адрес ноды, правила) тому, кто перехватил ссылку. Ключ НЕ
// выводится только из токена (токен виден в URL), а из общего секрета,
// зашитого в приложение Dogma. Поэтому:
//  - клиент Dogma (знает секрет) → расшифровывает;
//  - перехватчик со ссылкой (секрета нет) → видит случайные байты;
//  - Hiddify/телефон → используют обычный (незашифрованный) формат.
//
// Схема: key = HKDF-SHA256(ikm=secret, salt=token, info),  AES-256-GCM.
// Формат блоба: "DOGMA1:" + base64( iv(12) | tag(16) | ciphertext ).

const MAGIC = 'DOGMA1:';
const INFO = Buffer.from('dogma-subscription-v1');

function deriveKey(token, secret) {
  const ikm = Buffer.from(String(secret), 'utf8');
  const salt = Buffer.from(String(token), 'utf8');
  return Buffer.from(hkdfSync('sha256', ikm, salt, INFO, 32));
}

export function encryptSubscription(plaintext, token, secret) {
  if (!secret) throw new Error('SUBSCRIPTION_ENC_SECRET is not configured');
  const key = deriveKey(token, secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  return MAGIC + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

// Обратная операция — для тестов и (справочно) для клиента.
export function decryptSubscription(blob, token, secret) {
  if (typeof blob !== 'string' || !blob.startsWith(MAGIC)) throw new Error('BAD_FORMAT');
  const raw = Buffer.from(blob.slice(MAGIC.length), 'base64');
  if (raw.length < 12 + 16 + 1) throw new Error('BAD_LENGTH');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const key = deriveKey(token, secret);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

// Проверка «оба секрета совпадают» без утечки по времени (для будущего API).
export function secretsEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
