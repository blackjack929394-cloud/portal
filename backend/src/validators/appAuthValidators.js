import { z } from 'zod';

// Код QR — 32 случайных байта в base64url (~43 символа). Допускаем запас,
// чтобы не ломаться от URL-кодирования и будущих форматов.
const code = z.string().trim().min(16).max(200);

export const scanSchema = z.object({
  code,
  deviceName: z.string().trim().max(80).optional().default(''),
  platform: z.string().trim().max(32).optional().default(''),
  appVersion: z.string().trim().max(40).optional().default(''),
});

export const codeSchema = z.object({ code });

export const statusQuerySchema = z.object({ code });
