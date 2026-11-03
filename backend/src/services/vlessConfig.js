import { createHash } from 'node:crypto';

// Детерминированный UUID из токена подписки — один и тот же UUID для одного
// токена (для VLESS-клиента и для списка клиентов на ноде Xray). Формат v4-подобный.
export function tokenToUuid(token) {
  const b = createHash('sha256').update(`dogma-vless:${token}`).digest().subarray(0, 16);
  const x = Buffer.from(b);
  x[6] = (x[6] & 0x0f) | 0x40;
  x[8] = (x[8] & 0x3f) | 0x80;
  const h = x.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// vless://-ссылка (VLESS + TCP + Reality + Vision) для импорта в Happ/Xray-клиенты.
export function generateVlessRealityUri({ uuid, host, port, publicKey, shortId, sni, fingerprint = 'chrome', flow = 'xtls-rprx-vision', name = 'Dogma-VLESS' }) {
  const params = new URLSearchParams({
    encryption: 'none',
    security: 'reality',
    sni,
    fp: fingerprint,
    pbk: publicKey,
    type: 'tcp',
  });
  if (shortId) params.set('sid', shortId);
  if (flow) params.set('flow', flow);
  return `vless://${uuid}@${host}:${port}?${params.toString()}#${encodeURIComponent(name)}`;
}

// Клиентский sing-box outbound для VLESS.
// Админ заполняет uuid (и опционально flow, tls, transport) в extra ноды.

export function generateVlessClientOutbound({
  name,
  server,
  port,
  extra = {},
}) {
  const outbound = {
    type: 'vless',
    tag: name,
    server,
    server_port: port,
    uuid: extra.uuid,
  };

  if (extra.flow) {
    outbound.flow = extra.flow;
  }

  if (extra.tls) {
    outbound.tls = extra.tls;
  }

  if (extra.transport) {
    outbound.transport = extra.transport;
  }

  if (extra.packet_encoding) {
    outbound.packet_encoding = extra.packet_encoding;
  }

  return outbound;
}
