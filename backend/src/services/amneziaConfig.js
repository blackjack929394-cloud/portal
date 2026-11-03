import { randomInt } from 'node:crypto';

// Клиентский sing-box outbound для AmneziaWG.
// AmneziaWG — это форк WireGuard с обфускацией; в sing-box используется type: wireguard
// с дополнительными параметрами jc/jmin/jmax/s1/s2/h1/h2/h3/h4.

const AWG_RANGES = {
  jc: { min: 0, max: 128 },
  jmin: { min: 0, max: 1280 },
  jmax: { min: 0, max: 1280 },
  s1: { min: 0, max: 1280 },
  s2: { min: 0, max: 1280 },
  h1: { min: 0, max: 1280 },
  h2: { min: 0, max: 1280 },
  h3: { min: 0, max: 1280 },
  h4: { min: 0, max: 1280 },
};

function rand({ min, max }) {
  return randomInt(min, max + 1);
}

export function generateAmneziaWGDefaults() {
  const jmin = rand(AWG_RANGES.jmin);
  const jmax = Math.max(jmin, rand(AWG_RANGES.jmax));
  return {
    jc: rand(AWG_RANGES.jc),
    jmin,
    jmax,
    s1: rand(AWG_RANGES.s1),
    s2: rand(AWG_RANGES.s2),
    h1: rand(AWG_RANGES.h1),
    h2: rand(AWG_RANGES.h2),
    h3: rand(AWG_RANGES.h3),
    h4: rand(AWG_RANGES.h4),
  };
}

export function generateAmneziaWGClientOutbound({
  name,
  server,
  port,
  privateKey,
  peerPublicKey,
  presharedKey,
  localAddress = ['10.202.0.2/32'],
  allowedIps = ['0.0.0.0/0'],
  mtu = 1420,
  extra = {},
}) {
  const awg = {
    jc: extra.jc,
    jmin: extra.jmin,
    jmax: extra.jmax,
    s1: extra.s1,
    s2: extra.s2,
    h1: extra.h1,
    h2: extra.h2,
    h3: extra.h3,
    h4: extra.h4,
  };

  // Если какие-то параметры не заданы — используем значения по умолчанию.
  const defaults = generateAmneziaWGDefaults();
  for (const key of Object.keys(awg)) {
    if (awg[key] === undefined || awg[key] === null) {
      awg[key] = defaults[key];
    }
  }

  const outbound = {
    type: 'wireguard',
    tag: name,
    server,
    server_port: port,
    local_address: localAddress,
    private_key: privateKey,
    peer_public_key: peerPublicKey,
    mtu,
    ...awg,
  };

  if (presharedKey) {
    outbound.pre_shared_key = presharedKey;
  }

  if (allowedIps) {
    // sing-box ожидает allowed_ips только если нужно переопределить маршруты.
    outbound.allowed_ips = allowedIps;
  }

  return outbound;
}
