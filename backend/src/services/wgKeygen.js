import nacl from 'tweetnacl';

// WireGuard использует Curve25519 / X25519 с raw 32-байтовыми ключами в base64.
export function generateKeyPair() {
  const pair = nacl.box.keyPair();
  return {
    privateKey: Buffer.from(pair.secretKey).toString('base64'),
    publicKey: Buffer.from(pair.publicKey).toString('base64'),
  };
}

export function generatePresharedKey() {
  return Buffer.from(nacl.randomBytes(32)).toString('base64');
}
