import { parse, isValid } from './cidr.js';

// Простой аллокатор IP внутри WG-подсети.
// Первый адрес (.1) — промежуточный сервер, последующие — ноды.
export function allocateTunnelIps(networkCidr, existingNodeIps = []) {
  const subnet = parse(networkCidr);
  if (!isValid(subnet)) throw new Error(`Invalid WG tunnel network: ${networkCidr}`);

  const base = subnet.networkLong;
  const intermediateLong = base + 1;
  const used = new Set(existingNodeIps.map((ip) => ipToLong(ip)).filter(Boolean));

  let nodeLong = base + 2;
  while (nodeLong < subnet.broadcastLong && used.has(nodeLong)) {
    nodeLong += 1;
  }
  if (nodeLong >= subnet.broadcastLong) {
    throw new Error('No free WG tunnel IP available');
  }

  return {
    intermediateIp: longToIp(intermediateLong),
    nodeIp: longToIp(nodeLong),
    network: networkCidr,
  };
}

function ipToLong(ip) {
  const parts = ip?.split('.').map(Number);
  if (!parts || parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return parts.reduce((acc, part) => (acc << 8) | part, 0) >>> 0;
}

function longToIp(long) {
  return [(long >>> 24) & 0xff, (long >>> 16) & 0xff, (long >>> 8) & 0xff, long & 0xff].join('.');
}
