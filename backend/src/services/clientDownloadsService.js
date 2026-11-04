import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../config/index.js';

// Каталог по умолчанию: backend/public/downloads. В git он пустой (public/
// в .gitignore) — установочные файлы кладут при деплое или задают внешний URL.
const dirName = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DOWNLOAD_DIR = path.resolve(dirName, '../../public/downloads');

const PLATFORMS = [
  {
    id: 'android',
    platform: 'Android',
    name: 'Dogma Web для Android',
    description: 'Мобильный клиент с подпиской, маршрутизацией и входом по QR.',
    exts: ['.apk'],
    config: config.clients.android,
  },
  {
    id: 'windows',
    platform: 'Windows',
    name: 'Dogma Web для Windows',
    description: 'Десктопный клиент для Windows 10/11: тот же профиль и правила.',
    exts: ['.exe', '.msi'],
    config: config.clients.windows,
  },
];

function downloadDir() {
  return config.clients.downloadDir
    ? path.resolve(config.clients.downloadDir)
    : DEFAULT_DOWNLOAD_DIR;
}

function versionFromName(name) {
  const match = /(\d+\.\d+(?:\.\d+)?)/.exec(name || '');
  return match ? match[1] : null;
}

async function findLatestFile(exts) {
  let entries;
  try {
    entries = await fs.readdir(downloadDir(), { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!exts.includes(path.extname(entry.name).toLowerCase())) continue;
    const filePath = path.join(downloadDir(), entry.name);
    const stat = await fs.stat(filePath).catch(() => null);
    if (stat) {
      candidates.push({
        fileName: entry.name,
        filePath,
        sizeBytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
      });
    }
  }

  candidates.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return candidates[0] || null;
}

async function buildClient(meta, baseUrl) {
  const externalUrl = meta.config.url || '';
  const file = externalUrl ? null : await findLatestFile(meta.exts);
  const available = !!externalUrl || !!file;

  return {
    id: meta.id,
    platform: meta.platform,
    name: meta.name,
    description: meta.description,
    version: meta.config.version || versionFromName(file?.fileName),
    requirements: meta.config.requirements,
    sha256: meta.config.sha256 || null,
    sizeBytes: file?.sizeBytes ?? null,
    updatedAt: file?.updatedAt ?? null,
    fileName: file?.fileName ?? null,
    external: !!externalUrl,
    available,
    downloadUrl: available
      ? (externalUrl || `${baseUrl}/api/v1/clients/${meta.id}/download`)
      : null,
  };
}

export async function listClients(baseUrl) {
  return Promise.all(PLATFORMS.map((meta) => buildClient(meta, baseUrl)));
}

// Для контроллера скачивания: внешний URL → редирект, локальный файл → поток.
export async function resolveClientDownload(id) {
  const meta = PLATFORMS.find((p) => p.id === id);
  if (!meta) return null;

  if (meta.config.url) {
    return { externalUrl: meta.config.url, fileName: null, filePath: null };
  }
  const file = await findLatestFile(meta.exts);
  if (!file) return null;
  return { externalUrl: null, fileName: file.fileName, filePath: file.filePath };
}
