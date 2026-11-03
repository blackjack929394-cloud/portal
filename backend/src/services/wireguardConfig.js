// Плейн-WireGuard (без обфускации Amnezia): sing-box outbound + классический .conf.
// Используется, когда портал «фронтит» уже существующий WireGuard-сервер на ноде
// через промежуточный RU-сервер (клиент подключается к RU, RU пробрасывает в туннель).
//
// Параметры клиента хранятся в node.extra:
//   clientPrivateKey — приватный ключ клиента (peer на WG-сервере ноды)
//   serverPublicKey  — публичный ключ WG-сервера ноды
//   presharedKey     — общий preshared-ключ (опционально)
//   address          — адрес клиента в сети WG-сервера, напр. "10.200.200.3/32"
//   dns              — DNS для клиента (по умолчанию 1.1.1.1)
//   allowedIps       — маршруты в туннель (по умолчанию 0.0.0.0/0)
//   mtu              — MTU (по умолчанию 1420)

function normalizeAllowedIps(allowedIps) {
  if (!allowedIps) return ['0.0.0.0/0'];
  return Array.isArray(allowedIps) ? allowedIps : [allowedIps];
}

function stripCidr(address) {
  // sing-box local_address ожидает адрес с префиксом; .conf — тоже. Возвращаем как есть.
  return address;
}

export function generateWireguardClientOutbound({ name, server, port, extra = {} }) {
  const outbound = {
    type: 'wireguard',
    tag: name,
    server,
    server_port: port,
    local_address: [stripCidr(extra.address || '10.200.200.3/32')],
    private_key: extra.clientPrivateKey,
    peer_public_key: extra.serverPublicKey,
    mtu: extra.mtu || 1280,
  };
  if (extra.presharedKey) {
    outbound.pre_shared_key = extra.presharedKey;
  }
  const allowed = normalizeAllowedIps(extra.allowedIps);
  // 0.0.0.0/0 — маршрут по умолчанию, sing-box берёт его сам; указываем только если сузили.
  if (!(allowed.length === 1 && allowed[0] === '0.0.0.0/0')) {
    outbound.allowed_ips = allowed;
  }
  return outbound;
}

// Классический WireGuard .conf (для импорта в Hiddify / приложение WireGuard).
export function buildWireguardConf({ server, port, extra = {} }) {
  const allowed = normalizeAllowedIps(extra.allowedIps).join(', ');
  const lines = [
    '[Interface]',
    `PrivateKey = ${extra.clientPrivateKey}`,
    `Address = ${extra.address || '10.200.200.3/32'}`,
    `DNS = ${extra.dns || '1.1.1.1'}`,
    `MTU = ${extra.mtu || 1280}`,
    '',
    '[Peer]',
    `PublicKey = ${extra.serverPublicKey}`,
    ...(extra.presharedKey ? [`PresharedKey = ${extra.presharedKey}`] : []),
    `Endpoint = ${server}:${port}`,
    `AllowedIPs = ${allowed}`,
    'PersistentKeepalive = 25',
    '',
  ];
  return lines.join('\n');
}
