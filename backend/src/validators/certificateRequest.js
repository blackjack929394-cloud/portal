import { z } from 'zod';

// Allow Cyrillic + Latin letters, spaces, hyphens and apostrophes.
const nameRegex = /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё \-']{1,99}$/u;

export const createRequestSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'ФИО слишком короткое')
    .max(100, 'ФИО слишком длинное')
    .regex(nameRegex, 'ФИО содержит недопустимые символы'),
  email: z.string().trim().email('Некорректный email').optional(),
});

// Регистрация гостя: ФИО и почта обязательны.
export const guestRegisterSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'ФИО слишком короткое')
    .max(100, 'ФИО слишком длинное')
    .regex(nameRegex, 'ФИО содержит недопустимые символы'),
  email: z.string().trim().email('Некорректный email'),
});
