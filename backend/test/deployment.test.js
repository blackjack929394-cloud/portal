import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, generatePresharedKey } from '../src/services/wgKeygen.js';
import {
  generatePassword,
  generateServerConfig,
  generateDockerCompose,
  generateClientOutbound,
} from '../src/services/hysteriaConfig.js';
import { generateVlessClientOutbound } from '../src/services/vlessConfig.js';
import { generateAmneziaWGClientOutbound, generateAmneziaWGDefaults } from '../src/services/amneziaConfig.js';
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

test('VLESS client outbound is correct', () => {
  const out = generateVlessClientOutbound({
    name: 'eu-vless',
    server: 'vless.example.com',
    port: 443,
    extra: { uuid: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', flow: 'xtls-rprx-vision' },
  });
  assert.equal(out.type, 'vless');
  assert.equal(out.tag, 'eu-vless');
  assert.equal(out.server, 'vless.example.com');
  assert.equal(out.server_port, 443);
  assert.equal(out.uuid, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  assert.equal(out.flow, 'xtls-rprx-vision');
});

test('AmneziaWG defaults are within valid ranges', () => {
  const defaults = generateAmneziaWGDefaults();
  assert.ok(defaults.jc >= 0 && defaults.jc <= 128);
  assert.ok(defaults.jmin >= 0 && defaults.jmin <= 1280);
  assert.ok(defaults.jmax >= defaults.jmin && defaults.jmax <= 1280);
  assert.ok(defaults.s1 >= 0 && defaults.s1 <= 1280);
  assert.ok(defaults.h1 >= 0 && defaults.h1 <= 1280);
});

test('AmneziaWG client outbound includes obfuscation params', () => {
  const out = generateAmneziaWGClientOutbound({
    name: 'eu-awg',
    server: 'awg.example.com',
    port: 51820,
    privateKey: 'cCJmMCMw8LTgJGWxP0HWXjkzV+lIa7E7XBS4Rsi8pGg=',
    peerPublicKey: 'aPdDKXO/eL0EBO6tvuxmLM/JoC9eyjO7wMkX9J1QEG8=',
    extra: { jc: 5, jmin: 50, jmax: 100, s1: 10, s2: 20, h1: 30, h2: 40, h3: 50, h4: 60 },
  });
  assert.equal(out.type, 'wireguard');
  assert.equal(out.tag, 'eu-awg');
  assert.equal(out.server, 'awg.example.com');
  assert.equal(out.server_port, 51820);
  assert.equal(out.private_key, 'cCJmMCMw8LTgJGWxP0HWXjkzV+lIa7E7XBS4Rsi8pGg=');
  assert.equal(out.peer_public_key, 'aPdDKXO/eL0EBO6tvuxmLM/JoC9eyjO7wMkX9J1QEG8=');
  assert.equal(out.jc, 5);
  assert.equal(out.jmax, 100);
  assert.equal(out.h4, 60);
});
