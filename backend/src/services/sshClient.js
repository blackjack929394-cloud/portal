import { Client } from 'ssh2';
import fs from 'node:fs';

function resolvePrivateKey(keyOrPath, keyBase64) {
  if (keyBase64) {
    return Buffer.from(keyBase64, 'base64');
  }
  if (keyOrPath) {
    if (keyOrPath.includes('-----BEGIN OPENSSH PRIVATE KEY-----') || keyOrPath.includes('-----BEGIN RSA PRIVATE KEY-----')) {
      return Buffer.from(keyOrPath);
    }
    return fs.readFileSync(keyOrPath);
  }
  throw new Error('No SSH private key provided (need key, path, or base64)');
}

export class SshClient {
  constructor({ host, port = 22, username = 'root', privateKey, privateKeyPath, privateKeyBase64 }) {
    this.host = host;
    this.port = port;
    this.username = username;
    this.privateKey = resolvePrivateKey(privateKey || privateKeyPath, privateKeyBase64);
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      conn
        .on('ready', () => resolve(conn))
        .on('error', reject)
        .connect({
          host: this.host,
          port: this.port,
          username: this.username,
          privateKey: this.privateKey,
          readyTimeout: 20000,
        });
    });
  }

  async exec(command) {
    const conn = await this.connect();
    try {
      return await new Promise((resolve, reject) => {
        conn.exec(command, (err, stream) => {
          if (err) return reject(err);
          let stdout = '';
          let stderr = '';
          let code = null;
          stream
            .on('close', (exitCode) => {
              code = exitCode;
              resolve({ code, stdout, stderr });
            })
            .on('data', (data) => {
              stdout += data.toString();
            })
            .stderr.on('data', (data) => {
              stderr += data.toString();
            });
        });
      });
    } finally {
      conn.end();
    }
  }

  async writeFile(remotePath, content, mode = 0o600) {
    const conn = await this.connect();
    try {
      return await new Promise((resolve, reject) => {
        conn.sftp((err, sftp) => {
          if (err) return reject(err);
          const stream = sftp.createWriteStream(remotePath, { mode });
          stream.on('error', reject);
          stream.on('close', resolve);
          stream.end(Buffer.from(content));
        });
      });
    } finally {
      conn.end();
    }
  }

  async testConnection() {
    const { code, stdout, stderr } = await this.exec('echo ok');
    if (code !== 0) throw new Error(`SSH test failed: ${stderr || stdout}`);
    return true;
  }
}

export function createSshClient(credentials) {
  return new SshClient(credentials);
}
