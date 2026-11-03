import config from '../config/index.js';
import logger from '../utils/logger.js';
import { audit } from './auditService.js';
import { vpnNodeStore } from '../models/VpnNode.js';
import { createSshClient } from './sshClient.js';
import { generateKeyPair, generatePresharedKey } from './wgKeygen.js';
import { allocateTunnelIps } from './wgNetworkAllocator.js';
import {
  generateServerConfig,
  generateDockerCompose,
  generatePassword,
} from './hysteriaConfig.js';

const WG_CONFIG_PATH = '/etc/wireguard/wg0.conf';
const HYSTERIA_DIR = '/opt/hysteria-node';
const HYSTERIA_CONFIG_PATH = `${HYSTERIA_DIR}/config.yaml`;
const HYSTERIA_COMPOSE_PATH = `${HYSTERIA_DIR}/docker-compose.yaml`;
const HYSTERIA_CERT_PATH = `${HYSTERIA_DIR}/server.crt`;
const HYSTERIA_KEY_PATH = `${HYSTERIA_DIR}/server.key`;
const TRAFFIC_STATS_PORT = 9999;

function getIntermediateSshConfig() {
  const c = config.intermediate;
  if (!c.host) throw new Error('RU_INTERMEDIATE_HOST is not configured');
  if (!c.sshKeyPath && !c.sshKeyBase64) throw new Error('RU intermediate SSH key is not configured');
  return {
    host: c.host,
    port: c.sshPort,
    username: c.sshUser,
    privateKeyPath: c.sshKeyPath,
    privateKeyBase64: c.sshKeyBase64,
  };
}

function buildNodeSshConfig(node) {
  if (!node.sshHost) throw new Error('Node SSH host is not set');
  if (!node.sshKey && !node.sshKeyPath && !node.sshKeyBase64) {
    throw new Error('Node SSH key is not set');
  }
  return {
    host: node.sshHost,
    port: node.sshPort || 22,
    username: node.sshUser || 'root',
    privateKey: node.sshKey,
    privateKeyPath: node.sshKeyPath,
    privateKeyBase64: node.sshKeyBase64,
  };
}

async function ensureWireGuard(ssh) {
  const { code, stdout, stderr } = await ssh.exec('which wg || (apt-get update && apt-get install -y wireguard-tools) || (yum install -y wireguard-tools)');
  if (code !== 0) {
    throw new Error(`Failed to install WireGuard: ${stderr || stdout}`);
  }
}

async function ensureDocker(ssh) {
  const { code } = await ssh.exec('which docker || (curl -fsSL https://get.docker.com | sh)');
  if (code !== 0) {
    throw new Error('Failed to install Docker on node');
  }
  await ssh.exec('systemctl enable --now docker');
}

function buildWgConfig({ privateKey, listenPort, address, peers }) {
  const peerSections = peers
    .map(
      (p) => `[Peer]
PublicKey = ${p.publicKey}
AllowedIPs = ${p.allowedIps}
${p.endpoint ? `Endpoint = ${p.endpoint}\n` : ''}${p.persistentKeepalive ? `PersistentKeepalive = ${p.persistentKeepalive}\n` : ''}`,
    )
    .join('\n');

  return `[Interface]
PrivateKey = ${privateKey}
Address = ${address}
${listenPort ? `ListenPort = ${listenPort}\n` : ''}PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o wg0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o wg0 -j MASQUERADE

${peerSections}
`;
}

async function deployWireGuardIntermediate({ ssh, nodeIp, nodePublicKey, intermediateIp, network, wgListenPort }) {
  const keys = generateKeyPair();
  const cfg = buildWgConfig({
    privateKey: keys.privateKey,
    listenPort: wgListenPort,
    address: `${intermediateIp}/${network.split('/')[1]}`,
    peers: [
      {
        publicKey: nodePublicKey,
        allowedIps: `${nodeIp}/32`,
      },
    ],
  });

  await ssh.exec('mkdir -p /etc/wireguard && chmod 700 /etc/wireguard');
  await ssh.writeFile(WG_CONFIG_PATH, cfg, 0o600);
  await ssh.exec('sysctl -w net.ipv4.ip_forward=1 && sed -i "s/#net.ipv4.ip_forward=1/net.ipv4.ip_forward=1/" /etc/sysctl.conf');
  await ssh.exec('wg-quick down wg0 2>/dev/null; wg-quick up wg0');
  await ssh.exec('systemctl enable wg-quick@wg0');

  return keys;
}

async function deployWireGuardNode({ ssh, nodeIp, nodePrivateKey, intermediatePublicKey, intermediateIp, intermediateHost, network, wgListenPort }) {
  const cfg = buildWgConfig({
    privateKey: nodePrivateKey,
    address: `${nodeIp}/${network.split('/')[1]}`,
    peers: [
      {
        publicKey: intermediatePublicKey,
        allowedIps: `${intermediateIp}/32`,
        endpoint: `${intermediateHost}:${wgListenPort}`,
        persistentKeepalive: 25,
      },
    ],
  });

  await ssh.exec('mkdir -p /etc/wireguard && chmod 700 /etc/wireguard');
  await ssh.writeFile(WG_CONFIG_PATH, cfg, 0o600);
  await ssh.exec('wg-quick down wg0 2>/dev/null; wg-quick up wg0');
  await ssh.exec('systemctl enable wg-quick@wg0');
}

async function deployHysteria({ ssh, nodeIp, port, authUrl }) {
  await ssh.exec(`mkdir -p ${HYSTERIA_DIR} && chmod 700 ${HYSTERIA_DIR}`);
  await ssh.exec(
    `openssl req -x509 -newkey rsa:2048 -keyout ${HYSTERIA_KEY_PATH} -out ${HYSTERIA_CERT_PATH} -days 365 -nodes -subj "/CN=hysteria-node"`,
  );
  const { stdout: certFingerprint } = await ssh.exec(`openssl x509 -in ${HYSTERIA_CERT_PATH} -noout -sha256 -fingerprint | cut -d= -f2 | tr -d ':'`);
  const fingerprint = certFingerprint.trim();

  const trafficStatsSecret = generatePassword(32);
  const serverConfig = generateServerConfig({
    listenHost: nodeIp,
    listenPort: port,
    authUrl,
    certPath: HYSTERIA_CERT_PATH,
    keyPath: HYSTERIA_KEY_PATH,
    trafficStats: {
      listen: `${nodeIp}:${TRAFFIC_STATS_PORT}`,
      secret: trafficStatsSecret,
    },
  });
  const compose = generateDockerCompose({ image: config.deployment.hysteriaDockerImage, configPath: HYSTERIA_CONFIG_PATH, certPath: HYSTERIA_CERT_PATH, keyPath: HYSTERIA_KEY_PATH });

  await ssh.writeFile(HYSTERIA_CONFIG_PATH, serverConfig, 0o600);
  await ssh.writeFile(HYSTERIA_COMPOSE_PATH, compose, 0o600);
  await ssh.exec(`cd ${HYSTERIA_DIR} && docker compose down 2>/dev/null; docker compose up -d`);

  return {
    fingerprint,
    trafficStatsSecret,
    trafficStatsEndpoint: `http://${nodeIp}:${TRAFFIC_STATS_PORT}/traffic`,
  };
}

async function configureIntermediateForwarding({ ssh, publicPort, nodeIp, hysteriaPort }) {
  // Удаляем все старые DNAT-правила для данного публичного порта (с любым destination),
  // чтобы не оставалось "зомби"-форвардингов после смены IP ноды или порта.
  await ssh.exec(`iptables -t nat -L PREROUTING -n --line-numbers | grep -E 'dpt:${publicPort}' | awk '{print \\$1}' | sort -rn | while read n; do iptables -t nat -D PREROUTING \\$n; done`);
  await ssh.exec(`iptables -D FORWARD -p udp -d ${nodeIp} --dport ${hysteriaPort} -j ACCEPT 2>/dev/null || true`);
  await ssh.exec(`iptables -D FORWARD -p tcp -d ${nodeIp} --dport ${hysteriaPort} -j ACCEPT 2>/dev/null || true`);

  await ssh.exec(`iptables -t nat -A PREROUTING -p udp --dport ${publicPort} -j DNAT --to-destination ${nodeIp}:${hysteriaPort}`);
  await ssh.exec(`iptables -t nat -A PREROUTING -p tcp --dport ${publicPort} -j DNAT --to-destination ${nodeIp}:${hysteriaPort}`);
  await ssh.exec('iptables -t nat -A POSTROUTING -o wg0 -j MASQUERADE');
  await ssh.exec(`iptables -A FORWARD -p udp -d ${nodeIp} --dport ${hysteriaPort} -j ACCEPT`);
  await ssh.exec(`iptables -A FORWARD -p tcp -d ${nodeIp} --dport ${hysteriaPort} -j ACCEPT`);

  await ssh.exec('mkdir -p /etc/iptables && iptables-save > /etc/iptables/rules.v4 2>/dev/null || true');
}

export async function deployNode(nodeId) {
  const node = await vpnNodeStore.get(nodeId);
  if (!node) throw new Error('Node not found');

  await vpnNodeStore.update(nodeId, { deploymentStatus: 'deploying', deploymentError: null });
  audit('vpn.node_deploy_started', { nodeId });
  logger.info({ nodeId }, 'Starting node deployment');

  try {
    const intermediateCfg = getIntermediateSshConfig();
    const nodeCfg = buildNodeSshConfig(node);
    const intermediateSsh = createSshClient(intermediateCfg);
    const nodeSsh = createSshClient(nodeCfg);

    await intermediateSsh.testConnection();
    await nodeSsh.testConnection();

    await ensureWireGuard(intermediateSsh);
    await ensureWireGuard(nodeSsh);

    const existingIps = (await vpnNodeStore.listAll()).map((n) => n.wgTunnelIp).filter(Boolean);
    const { intermediateIp, nodeIp } = allocateTunnelIps(config.deployment.wgTunnelNetwork, existingIps);
    const port = node.port || 443;
    const authUrl = `${config.publicBaseUrl || `https://${config.intermediate.host}`}/hysteria/auth`;

    // 1. Деплой WG на intermediate (нужен публичный ключ ноды)
    const nodeWgKeys = generateKeyPair();
    const intermediateWgKeys = await deployWireGuardIntermediate({
      ssh: intermediateSsh,
      nodeIp,
      nodePublicKey: nodeWgKeys.publicKey,
      intermediateIp,
      network: config.deployment.wgTunnelNetwork,
      wgListenPort: config.deployment.wgListenPort,
    });

    // 2. Деплой WG на ноде (нужен публичный ключ intermediate)
    await deployWireGuardNode({
      ssh: nodeSsh,
      nodeIp,
      nodePrivateKey: nodeWgKeys.privateKey,
      intermediatePublicKey: intermediateWgKeys.publicKey,
      intermediateIp,
      intermediateHost: intermediateCfg.host,
      network: config.deployment.wgTunnelNetwork,
      wgListenPort: config.deployment.wgListenPort,
    });

    // 3. Деплой Hysteria на ноде
    const hysteria = await deployHysteria({ ssh: nodeSsh, nodeIp, port, authUrl });

    // 4. Форвардинг на intermediate
    await configureIntermediateForwarding({
      ssh: intermediateSsh,
      publicPort: port,
      nodeIp,
      hysteriaPort: port,
    });

    // 5. Проверка туннеля
    const { code: pingCode } = await intermediateSsh.exec(`ping -c 3 -W 5 ${nodeIp}`);
    if (pingCode !== 0) {
      logger.warn({ nodeId, nodeIp }, 'WG tunnel ping check failed');
    }

    const updated = await vpnNodeStore.update(nodeId, {
      kind: 'hysteria2',
      deploymentStatus: 'active',
      deploymentError: null,
      wgTunnelIp: nodeIp,
      wgPublicKey: nodeWgKeys.publicKey,
      wgPrivateKey: nodeWgKeys.privateKey,
      intermediateHost: intermediateCfg.host,
      intermediatePublicPort: port,
      hysteriaConfig: {
        port,
        authUrl,
        tlsFingerprint: hysteria.fingerprint,
      },
      trafficStatsEnabled: true,
      trafficStatsEndpoint: hysteria.trafficStatsEndpoint,
      trafficStatsSecret: hysteria.trafficStatsSecret,
      extra: {
        ...(node.extra || {}),
        network: config.deployment.wgTunnelNetwork,
        intermediateWgPublicKey: intermediateWgKeys.publicKey,
      },
    });

    audit('vpn.node_deploy_succeeded', { nodeId, nodeIp, intermediateHost: intermediateCfg.host });
    logger.info({ nodeId, nodeIp }, 'Node deployment completed');
    return updated;
  } catch (err) {
    await vpnNodeStore.update(nodeId, { deploymentStatus: 'failed', deploymentError: err.message });
    audit('vpn.node_deploy_failed', { nodeId, error: err.message });
    logger.error({ err, nodeId }, 'Node deployment failed');
    throw err;
  }
}

export function deployNodeAsync(nodeId) {
  deployNode(nodeId).catch(() => {
    // ошибка уже залогирована и сохранена в статусе ноды
  });
}
