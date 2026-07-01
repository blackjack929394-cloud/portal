export function parse(cidr) {
  if (!cidr || typeof cidr !== 'string') return null;
  const [ip, bits] = cidr.split('/');
  const mask = parseInt(bits, 10);
  if (Number.isNaN(mask) || mask < 0 || mask > 32) return null;
  const ipLong = ipToLong(ip);
  if (ipLong === null) return null;
  const maskLong = mask === 0 ? 0 : (~0 << (32 - mask)) >>> 0;
  const networkLong = (ipLong & maskLong) >>> 0;
  const broadcastLong = (networkLong | ~maskLong) >>> 0;
  return { ipLong, mask, networkLong, broadcastLong };
}

export function isValid(subnet) {
  return subnet && subnet.mask >= 24 && subnet.mask <= 30;
}

function ipToLong(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return parts.reduce((acc, part) => (acc << 8) | part, 0) >>> 0;
}
