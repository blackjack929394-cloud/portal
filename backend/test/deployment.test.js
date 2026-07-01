import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, generatePresharedKey } from '../src/services/wgKeygen.js';
import {
  generatePassword,
  generateServerConfig,
  generateDockerCompose,
  generateClientOutbound,
} from '../src/services/hysteriaConfig.js';
import { allocateTunnelIps } from '../src/services/wgNetworkAllocator.js';

test('WireGuard key pair is 32-byte base64', () => {
  const pair = generateKeyPair();
  assert.equal(Buffer.from(pair.privateKey, 'base64').length, 32);
  assert.equal(Buffer.from(pair.publicKey, 'base64').length, 32);
  assert.notEqual(pair.privateKey, pair.publicKey);
});

test('WireGuard preshared key is 32-byte base64', () => {
  const psk = generatePresharedKey();
  assert.equal(Buffer.from(psk, 'base64').length, 32);
});

test('Hysteria server config contains required fields', () => {
  const cfg = generateServerConfig({
    listenHost: '10.200.200.2',
    listenPort: 8443,
    password: 'secret',
    certPath: '/opt/hysteria/server.crt',
    keyPath: '/opt/hysteria/server.key',
  });
  assert.ok(cfg.includes('listen: 10.200.200.2:8443'));
  assert.ok(cfg.includes('password: secret'));
  assert.ok(cfg.includes('cert: /opt/hysteria/server.crt'));
  assert.ok(cfg.includes('masquerade:'));
});

test('Hysteria docker compose uses configured image', () => {
  const compose = generateDockerCompose({ image: 'hysteria:v2' });
  assert.ok(compose.includes('image: hysteria:v2'));
  assert.ok(compose.includes('network_mode: host'));
});

test('Hysteria client outbound for sing-box is correct', () => {
  const out = generateClientOutbound({
    name: 'eu-1',
    server: 'ru.example.com',
    port: 8443,
    password: 'secret',
    insecure: true,
  });
  assert.equal(out.type, 'hysteria2');
  assert.equal(out.tag, 'eu-1');
  assert.equal(out.server, 'ru.example.com');
  assert.equal(out.server_port, 8443);
  assert.equal(out.password, 'secret');
  assert.equal(out.tls.insecure, true);
});

test('WG tunnel IP allocator reserves .1 for intermediate', () => {
  const alloc = allocateTunnelIps('10.200.200.0/24', []);
  assert.equal(alloc.intermediateIp, '10.200.200.1');
  assert.equal(alloc.nodeIp, '10.200.200.2');
  assert.equal(alloc.network, '10.200.200.0/24');
});

test('WG tunnel IP allocator skips used IPs', () => {
  const alloc = allocateTunnelIps('10.200.200.0/24', ['10.200.200.2', '10.200.200.3']);
  assert.equal(alloc.nodeIp, '10.200.200.4');
});
