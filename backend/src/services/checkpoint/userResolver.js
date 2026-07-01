import { CheckpointApiError } from './CheckpointClient.js';
import config from '../../config/index.js';
import logger from '../../utils/logger.js';

// Minimal Cyrillic -> Latin transliteration for deriving a user-object name.
const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function translit(str) {
  return str
    .toLowerCase()
    .split('')
    .map((ch) => (TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch))
    .join('');
}

// Derive the Check Point user-object name (the certificate CN/DN is based on it).
// ⚠️ Using raw ФИО is not ideal. The real identity source should be finalized on
// the auth stage (SSO/AD). Prefer email when available; otherwise transliterate.
export function deriveUsername({ id, fullName, email }) {
  if (email) return email.trim().toLowerCase();
  const base = translit(fullName)
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  return base || `user-${String(id).slice(0, 8)}`;
}

// Ensure the internal user object exists. For LDAP-managed users this path does
// NOT apply — use the ICA management tool instead (see план, открытый вопрос #4).
export async function ensureUser(cp, { username, email }) {
  if (config.checkpoint.userManagement === 'ldap') {
    throw new Error(
      'CP_USER_MANAGEMENT=ldap: issue certificates via the ICA management tool, not this API path.',
    );
  }
  try {
    return await cp.call('show-user', { name: username });
  } catch (err) {
    const notFound =
      err instanceof CheckpointApiError &&
      /not_found|does not exist|not found/i.test(JSON.stringify(err.body || {}));
    if (!notFound) throw err;

    logger.info({ username }, 'Check Point: user not found, creating');
    const payload = { name: username };
    if (email) payload.email = email;
    // add-user exists on R81+. On older versions create via add-generic-object
    // (class CpmiUser) — implement that fallback here if your version needs it.
    return cp.call('add-user', payload);
  }
}
