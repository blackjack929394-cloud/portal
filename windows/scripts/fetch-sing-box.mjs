import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Скачивает sing-box для Windows amd64 в windows/bin.
// Используется при сборке; бинарник не коммитится.
const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(dir, '../bin');
const version = process.env.SING_BOX_VERSION || '1.14.4';
const url = `https://github.com/SagerNet/sing-box/releases/download/v${version}/sing-box-${version}-windows-amd64.zip`;

fs.mkdirSync(outDir, { recursive: true });
const zipPath = path.join(outDir, 'sing-box.zip');

const res = await fetch(url);
if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));

console.log(`Downloaded ${zipPath}`);
console.log('Extract sing-box.exe into windows/bin/sing-box.exe (or use Expand-Archive).');
