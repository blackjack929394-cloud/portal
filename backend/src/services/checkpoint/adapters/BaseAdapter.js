// Base interface for certificate issuance adapters.
//
// Each adapter receives a normalized request:
//   { id, fullName, email }
// and returns an "artifact" describing what was issued.
//
// Artifact shapes:
//   Registration key flow:
//     { type: 'registration-key', registrationKey, commonName, instructions }
//   PKCS#12 file flow:
//     { type: 'p12', filePath, fileName, password, commonName }
//
// Adapters ONLY issue. Secure delivery (one-time links, out-of-band password,
// file cleanup) is handled by the orchestration layer (certificateService).
export class BaseAdapter {
  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async issue(request) {
    throw new Error('issue() not implemented');
  }

  // eslint-disable-next-line class-methods-use-this, no-unused-vars
  async revoke(request) {
    throw new Error('revoke() not implemented');
  }
}
