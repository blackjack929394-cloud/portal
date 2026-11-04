import crypto from 'node:crypto';

// Опциональное шифрование секретов at-rest (AES-256-GCM).
// Если SECRETS_ENCRYPTION_KEY не задан, значения хранятся как раньше —
// это сохраняет обратную совместимость при внедрении.
const RAW_KEY = process.env.SECRETS_ENCRYPTION_KEY || '';
const KEY = RAW_KEY ? crypto.createHash('sha256').update(RAW_KEY).digest() : null;
const PREFIX = 'enc:v1:';

export function isSecretsEncryptionEnabled() {
  return !!KEY;
}

export function seal(value) {
  if (!KEY || value === null || value === undefined || value === '') return value;
  const text = String(value);
  if (text.startsWith(PREFIX)) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function open(value) {
  if (!KEY || typeof value !== 'string' || !value.startsWith(PREFIX)) return value;
  try {
    const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    // Повреждённый/чужой ключ: не роняем запрос, отдаём как есть.
    return value;
  }
}
