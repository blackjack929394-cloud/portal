import { z } from 'zod';

// Allow Cyrillic + Latin letters, spaces, hyphens and apostrophes.
const nameRegex = /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё \-']{1,99}$/u;

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

// Логин: 3–32 символа, латиница/цифры/._-
const usernameRegex = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$/;

// Регистрация аккаунта: ФИО, почта, логин, пароль.
export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'ФИО слишком короткое')
    .max(100, 'ФИО слишком длинное')
    .regex(nameRegex, 'ФИО содержит недопустимые символы'),
  email: z.string().trim().email('Некорректный email'),
  username: z.string().trim().regex(usernameRegex, 'Логин: 3–32 символа, латиница, цифры, . _ -'),
  password: z.string().min(8, 'Пароль минимум 8 символов').max(128, 'Пароль слишком длинный'),
});

// Вход по логину и паролю.
export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Введите логин'),
  password: z.string().min(1, 'Введите пароль'),
});