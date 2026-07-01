import fs from 'node:fs';
import * as certService from '../services/certificateService.js';

// Личность берётся из сессии (SSO), а не из тела запроса.
// Это гарантирует, что сертификат выпускается именно на вошедшего пользователя.
export function createRequest(req, res) {
  const user = req.session.user;
  const fullName = (user.name || '').trim();
  if (fullName.length < 2) {
    return res.status(422).json({ error: 'IDENTITY_INCOMPLETE' });
  }
  const meta = { ip: req.ip, userAgent: req.get('user-agent') || null, sub: user.sub };
  const record = certService.submitRequest({ fullName, email: user.email || null, meta });
  return res.status(202).json(certService.getStatus(record.id));
}

export function getStatus(req, res) {
  const view = certService.getStatus(req.params.id);
  if (!view) return res.status(404).json({ error: 'NOT_FOUND' });
  return res.json(view);
}

export function approve(req, res) {
  const record = certService.approveRequest(req.params.id);
  if (!record) return res.status(404).json({ error: 'NOT_FOUND' });
  return res.json(certService.getStatus(req.params.id));
}

export function download(req, res) {
  const result = certService.consumeDownload(req.params.token);
  if (result.error) {
    const code = result.error === 'NOT_FOUND' ? 404 : 410;
    return res.status(code).json({ error: result.error });
  }
  const { artifact } = result;

  if (artifact.type === 'registration-key') {
    return res.json({
      type: 'registration-key',
      registrationKey: artifact.registrationKey,
      commonName: artifact.commonName,
      instructions: artifact.instructions,
    });
  }

  if (artifact.type === 'p12') {
    if (!fs.existsSync(artifact.filePath)) {
      return res.status(410).json({ error: 'ARTIFACT_GONE' });
    }
    res.setHeader('Content-Type', 'application/x-pkcs12');
    // RFC 5987: ASCII fallback + UTF-8 form so Cyrillic names are valid in the header.
    const asciiName = artifact.fileName.replace(/[^\x20-\x7E]/g, '_');
    const utf8Name = encodeURIComponent(artifact.fileName);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
    );
    const stream = fs.createReadStream(artifact.filePath);
    // One-time download: remove the file from disk once it has been sent.
    stream.on('close', () => fs.unlink(artifact.filePath, () => {}));
    return stream.pipe(res);
  }

  return res.status(500).json({ error: 'UNKNOWN_ARTIFACT' });
}

export function revealPassword(req, res) {
  const result = certService.revealPassword(req.params.token);
  if (result.error) {
    const code = result.error === 'NOT_FOUND' ? 404 : 410;
    return res.status(code).json({ error: result.error });
  }
  return res.json({ password: result.password });
}
