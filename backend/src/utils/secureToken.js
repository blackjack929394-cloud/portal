import crypto from 'node:crypto';

// URL-safe random token for one-time download / password-reveal links.
export function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

// Strong password used to protect PKCS#12 (.p12) files.
export function generatePassword(length = 20) {
  const charset =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#%^*_-';
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += charset[bytes[i] % charset.length];
  }
  return out;
}
