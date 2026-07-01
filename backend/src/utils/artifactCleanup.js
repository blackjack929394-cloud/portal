import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../config/index.js';
import logger from './logger.js';

const dirName = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACT_DIR = path.resolve(dirName, '../../storage/artifacts');

// Remove .p12 files left on disk (e.g. never downloaded) once they are older
// than the download token TTL — they are useless after the token expires.
export function startArtifactCleanup() {
  const maxAgeMs = config.downloadTokenTtlSeconds * 1000;
  const sweep = () => {
    fs.readdir(ARTIFACT_DIR, (err, files) => {
      if (err) return; // dir not created yet
      const now = Date.now();
      files.forEach((file) => {
        const full = path.join(ARTIFACT_DIR, file);
        fs.stat(full, (e, st) => {
          if (!e && now - st.mtimeMs > maxAgeMs) {
            fs.unlink(full, () => logger.info({ file }, 'cleaned up expired artifact'));
          }
        });
      });
    });
  };
  const timer = setInterval(sweep, 60 * 1000);
  timer.unref();
  return timer;
}
