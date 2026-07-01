import { randomBytes } from 'node:crypto';

export function generatePassword(length = 32) {
  return randomBytes(length).toString('base64url').slice(0, length);
}

export function generateServerConfig({ listenHost, listenPort, password, certPath, keyPath, masqueradeUrl = 'https://bing.com' }) {
  return `listen: ${listenHost}:${listenPort}

tls:
  cert: ${certPath}
  key: ${keyPath}

auth:
  type: password
  password: ${password}

masquerade:
  type: proxy
  proxy:
    url: ${masqueradeUrl}
    rewriteHost: true
`;
}

export function generateDockerCompose({ image, configPath = '/etc/hysteria/config.yaml', certPath = '/etc/hysteria/server.crt', keyPath = '/etc/hysteria/server.key' }) {
  return `services:
  hysteria:
    image: ${image}
    container_name: hysteria-node
    restart: unless-stopped
    network_mode: host
    cap_add:
      - NET_BIND_SERVICE
    volumes:
      - ${configPath}:${configPath}:ro
      - ${certPath}:${certPath}:ro
      - ${keyPath}:${keyPath}:ro
    command: ["server", "-c", "${configPath}"]
`;
}

export function generateClientOutbound({ name, server, port, password, tlsFingerprint, insecure = false }) {
  const outbound = {
    type: 'hysteria2',
    tag: name,
    server,
    server_port: port,
    password,
  };
  if (insecure) {
    outbound.tls = { insecure: true };
  } else if (tlsFingerprint) {
    outbound.tls = { pin_sha256: tlsFingerprint };
  }
  return outbound;
}

export function buildSubscriptionForNode(node) {
  return {
    protocol: 'hysteria2',
    host: node.intermediateHost || node.host,
    port: node.intermediatePublicPort || node.port,
    password: node.hysteriaConfig?.password,
    tls: node.hysteriaConfig?.tlsFingerprint
      ? { pin_sha256: node.hysteriaConfig.tlsFingerprint }
      : { insecure: true },
  };
}
