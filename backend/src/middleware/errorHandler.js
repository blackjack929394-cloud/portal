import logger from '../utils/logger.js';

export function notFound(req, res) {
  res.status(404).json({ error: 'NOT_FOUND', path: req.path });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  logger.error({ err }, 'unhandled error');
  const status = err.status || 500;
  res.status(status).json({
    error: err.code || 'INTERNAL_ERROR',
    message: status < 500 ? err.message : 'Internal server error',
  });
}
