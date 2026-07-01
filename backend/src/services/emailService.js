import nodemailer from 'nodemailer';
import config from '../config/index.js';
import logger from '../utils/logger.js';

let transporter = null;

// SMTP считается настроенным, если задан хост.
export function emailEnabled() {
  return Boolean(config.smtp.host);
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure, // true для 465, false для 587/STARTTLS
      auth: config.smtp.user
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined,
    });
  }
  return transporter;
}

// Отправляет пароль к .p12 на почту пользователя (отдельный канал от файла).
export async function sendPasswordEmail({ to, fullName, password, fileName }) {
  const subject = 'Пароль к вашему сертификату DOGMA';
  const text =
    `Здравствуйте, ${fullName}.\n\n` +
    `Ваш сертификат (${fileName}) выпущен. Пароль для открытия файла:\n\n` +
    `${password}\n\n` +
    `Файл вы скачиваете на портале отдельно. Не пересылайте этот пароль и сам файл одним сообщением.`;
  const html =
    `<p>Здравствуйте, ${escapeHtml(fullName)}.</p>` +
    `<p>Ваш сертификат (<b>${escapeHtml(fileName)}</b>) выпущен. Пароль для открытия файла:</p>` +
    `<p style="font:600 18px/1.4 monospace;letter-spacing:1px">${escapeHtml(password)}</p>` +
    `<p>Файл вы скачиваете на портале отдельно. Не пересылайте этот пароль и сам файл одним сообщением.</p>`;

  await getTransporter().sendMail({ from: config.smtp.from, to, subject, text, html });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
