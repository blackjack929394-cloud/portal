// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for the Check Point "set-user" certificate payloads and
// for extracting values out of the responses.
//
// These payloads are derived from the documented mgmt_cli dotted syntax:
//   set user name <u> certificates.add.registration-key.expiration-days 14
//   set user name <u> certificates.add.registration-key.comment   "<comment>"
//   set user name <u> certificates.add.certificate-file.password   "<password>"
// (see Check Point CheckMates: "VPN User Certificates" / "Script to create users
//  and their certificates", and the R81 "Operations with Certificates" guide).
//
// ⚠️ The exact REST/JSON nesting can differ slightly between versions. Run
//    `npm run poc -- --issue-regkey <testuser>` against your management server,
//    inspect the dumped JSON, and adjust ONLY this file if a field name differs.
// ─────────────────────────────────────────────────────────────────────────────

export function buildRegistrationKeyPayload({ name, comment, expirationDays }) {
  return {
    name,
    certificates: {
      add: {
        'registration-key': {
          'expiration-days': expirationDays,
          comment,
        },
      },
    },
  };
}

export function buildP12Payload({ name, password, comment, validityDays }) {
  const certFile = { password, comment };
  if (validityDays) certFile['validity-days'] = validityDays;
  return {
    name,
    certificates: {
      add: {
        'certificate-file': certFile,
      },
    },
  };
}

export function buildShowUserPayload(name) {
  return { name, 'show-certificates': true };
}

// ── Response extractors (resilient to field-name / nesting variance) ──────────

// Recursively find the first value for a given key anywhere in the object tree.
function deepFind(obj, key) {
  if (obj == null || typeof obj !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key] != null) return obj[key];
  for (const value of Object.values(obj)) {
    const found = deepFind(value, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

// Find the certificate object whose comment matches (used to pick the cert we
// just created, even when the user already has other certificates).
export function findCertificateByComment(response, comment) {
  const stack = [response];
  while (stack.length) {
    const node = stack.pop();
    if (node == null || typeof node !== 'object') continue;
    if (Array.isArray(node)) {
      for (const item of node) stack.push(item);
      continue;
    }
    const nodeComment = node.comment ?? node.Comment;
    if (nodeComment && String(nodeComment) === String(comment)) return node;
    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return null;
}

export function extractRegistrationKey(certObjOrResponse) {
  return deepFind(certObjOrResponse, 'registration-key');
}

// Find the longest base64-looking string in the tree — that is the exported p12.
export function extractP12Base64(response) {
  let best = '';
  const isB64 = (s) => typeof s === 'string' && s.length > 100 && /^[A-Za-z0-9+/=\r\n]+$/.test(s);
  const stack = [response];
  while (stack.length) {
    const node = stack.pop();
    if (node == null) continue;
    if (typeof node === 'string') {
      if (isB64(node) && node.length > best.length) best = node;
    } else if (typeof node === 'object') {
      for (const value of Object.values(node)) stack.push(value);
    }
  }
  return best || null;
}
