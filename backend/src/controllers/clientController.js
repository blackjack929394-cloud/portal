import config from '../config/index.js';
import logger from '../utils/logger.js';
import { listClients as listClientMetadata, resolveClientDownload } from '../services/clientDownloadsService.js';

function baseUrlFor(req) {
  return config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
}

// Метаданные для страницы /download: версии, размеры, ссылки.
export async function listClients(req, res, next) {
  try {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.json({ clients: await listClientMetadata(baseUrlFor(req)) });
  } catch (err) {
    return next(err);
  }
}

// Скачивание локального файла или редирект на внешний URL (CDN/GitHub Releases).
export async function downloadClient(req, res, next) {
  try {
    const target = await resolveClientDownload(req.params.id);
    if (!target) return res.status(404).json({ error: 'CLIENT_NOT_AVAILABLE' });
    if (target.externalUrl) return res.redirect(302, target.externalUrl);

    logger.info({ client: req.params.id, file: target.fileName }, 'client download');
    return res.download(target.filePath, target.fileName, (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (err) {
    return next(err);
  }
}
