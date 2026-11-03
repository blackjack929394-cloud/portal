import { randomBytes } from 'node:crypto';

export function generatePassword(length = 32) {
  return randomBytes(length).toString('base64url').slice(0, length);
}

export function generateServerConfig({ listenHost, listenPort, authUrl, certPath, keyPath, masqueradeUrl = 'https://bing.com', trafficStats }) {
  const authSection = authUrl
    ? `auth:\n  type: http\n  http:\n    url: ${authUrl}\n`
    : `auth:\n  type: password\n  password: ${generatePassword()}\n`;

  let trafficStatsSection = '';
  if (trafficStats && trafficStats.listen) {
    const secretLine = trafficStats.secret ? `  secret: ${trafficStats.secret}\n` : '';
    trafficStatsSection = `trafficStats:\n  listen: ${trafficStats.listen}\n${secretLine}`;
  }

  return `listen: ${listenHost}:${listenPort}\n\ntls:\n  cert: ${certPath}\n  key: ${keyPath}\n\n${authSection}${trafficStatsSection}masquerade:\n  type: proxy\n  proxy:\n    url: ${masqueradeUrl}\n    rewriteHost: true\n`;
}

export function generateDockerCompose({ image, configPath = '/etc/hysteria/config.yaml', certPath = '/etc/hysteria/server.crt', keyPath = '/etc/hysteria/server.key' }) {
  return `services:\n  hysteria:\n    image: ${image}\n    container_name: hysteria-node\n    restart: unless-stopped\n    network_mode: host\n    cap_add:\n      - NET_BIND_SERVICE\n    volumes:\n      - ${configPath}:${configPath}:ro\n      - ${certPath}:${certPath}:ro\n      - ${keyPath}:${keyPath}:ro\n    command: ["server", "-c", "${configPath}"]\n`;
}

export function generateClientOutbound({ name, server, port, password, tlsFingerprint, insecure = false }) {
  const outbound = {
    type: 'hysteria2',
    tag: name,
    server,
    server_port: port,
    password,
  };
  // sing-box/Happ 1.12+ убрали allowInsecure; используем pin_sha256 сертификата.
  if (tlsFingerprint) {
    outbound.tls = { enabled: true, pin_sha256: [tlsFingerprint] };
  } else if (insecure) {
    outbound.tls = { enabled: true, insecure: true };
  }
  return outbound;
}

// hysteria2:// share-URI для импорта в Hiddify / sing-box / Happ.
// Happ 2.17+ больше не поддерживает allowInsecure, только pinnedPeerCertSha256.
export function generateHysteria2Uri({ name, server, port, password, sni = 'www.bing.com', insecure = true, fingerprint }) {
  const params = new URLSearchParams();
  if (sni) params.set('sni', sni);
  if (fingerprint) {
    params.set('pinSHA256', fingerprint);
  } else if (insecure) {
    params.set('insecure', '1');
  }
  const frag = name ? `#${encodeURIComponent(name)}` : '';
  return `hysteria2://${encodeURIComponent(password)}@${server}:${port}/?${params.toString()}${frag}`;
}

export function buildSubscriptionForNode(node) {
  return {
    protocol: 'hysteria2',
    host: node.intermediateHost || node.host,
    port: node.intermediatePublicPort || node.port,
    password: node.hysteriaConfig?.password,
    tls: node.hysteriaConfig?.tlsFingerprint
      ? { enabled: true, pin_sha256: [node.hysteriaConfig.tlsFingerprint] }
      : { enabled: true, insecure: true },
  };
}
