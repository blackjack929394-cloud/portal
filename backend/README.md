# Check Point Certificate Portal — Backend (Node.js)

Бэкенд self-service портала: пользователь вводит ФИО → заявка ставится в очередь →
выпускается сертификат/ключ регистрации через Check Point → результат отдаётся
по одноразовой защищённой ссылке.

Текущий статус — **Этап разработки 2**: каркас работает end-to-end на заглушке
(`MockAdapter`), реальные адаптеры Check Point (`registration-key` и `p12`)
реализованы по документированным командам Management API. Перед переключением с
`mock` нужно подтвердить точные поля на вашем стенде скриптом `npm run poc`
(см. «Этап 2» ниже).

## Стек

Node.js 18+ · Express · Zod (валидация) · Pino (логи/аудит) · Helmet · CORS ·
express-rate-limit. ESM, без БД на этом этапе (in-memory).

## Запуск

```bash
cp .env.example .env       # при необходимости поправьте значения
npm install
npm run dev                # nodemon, режим разработки
# или
npm start
```

Проверка: `GET http://localhost:8080/health`

> На этом этапе `CERT_ISSUANCE_MODE=mock` — настоящий сертификат не выпускается.
> Запуск в режиме `mock` при `NODE_ENV=production` намеренно запрещён.

## Тесты

```bash
npm test            # node --test, без доп. зависимостей
```

Покрыто: билдеры/экстракторы Check Point (`payloads`), генерация токенов,
валидация ФИО, и сквозной HTTP-сценарий (создание заявки → `ISSUED` →
одноразовое скачивание → запрет повторного использования токена). Тесты
гоняются на mock-адаптере, реальный Check Point не нужен.

## API

| Метод | Путь | Назначение |
|------|------|------------|
| POST | `/api/v1/certificate-requests` | Создать заявку (тело: `{ "fullName": "...", "email": "..." }`) |
| GET  | `/api/v1/certificate-requests/:id` | Статус заявки |
| POST | `/api/v1/certificate-requests/:id/approve` | Подтвердить заявку (админ; защитить на Этапе 2) |
| GET  | `/api/v1/download/:token` | Одноразовое получение артефакта (файл `.p12` или ключ регистрации) |
| GET  | `/api/v1/password/:token` | Одноразовое получение пароля к `.p12` (доставляется отдельным каналом) |

Жизненный цикл статусов: `QUEUED` → `PROCESSING` → `ISSUED` → `DELIVERED`
(или `PENDING_APPROVAL`, `FAILED`, `EXPIRED`).

### Быстрый сценарий (mock)

```bash
# 1) создать заявку
curl -s -X POST localhost:8080/api/v1/certificate-requests \
  -H 'content-type: application/json' \
  -d '{"fullName":"Иванов Иван Иванович"}'

# 2) опросить статус по id из ответа -> получить delivery.downloadToken
curl -s localhost:8080/api/v1/certificate-requests/<ID>

# 3) скачать артефакт (одноразовая ссылка)
curl -s -OJ localhost:8080/api/v1/download/<DOWNLOAD_TOKEN>
```

Ссылку на пароль (`/api/v1/password/<token>`) в dev-режиме пишется в лог —
в проде она отправляется пользователю out-of-band (Этап 3).

## Архитектура

```
routes → controllers → certificateService (оркестрация)
                          ├── queue (InMemoryQueue)         → BullMQ/Redis (Этап 2)
                          ├── store (in-memory)             → PostgreSQL (Этап 2)
                          ├── auditService (JSONL)          → БД/SIEM (Этап 2)
                          └── checkpoint/ (factory + adapters)
                               ├── MockAdapter               ✅ готов (dev)
                               ├── RegistrationKeyAdapter    ⛔ стаб (Этап 2)
                               ├── P12Adapter                ⛔ стаб (Этап 2)
                               └── CheckpointClient          (Management API)
```

Принцип: портал/бэкенд **не ходит в Check Point напрямую из контроллеров** — вся
интеграция изолирована в слое `checkpoint/`. Смена версии или способа выпуска =
правка только адаптера.

## Решения по безопасности (уже в коде)

- Helmet, CORS по белому списку origin, лимит размера тела запроса.
- Rate limit на создание заявок (анти-абьюз).
- Строгая валидация ФИО (Zod, кириллица/латиница).
- Одноразовые токены с TTL на скачивание и на пароль.
- Пароль `.p12` отделён от файла (разные токены) — под доставку разными каналами.
- Файл `.p12` удаляется с диска сразу после выдачи.
- Секреты не попадают в логи/аудит (редакция в Pino; аудит без секретного материала).
- Запрет mock-выпуска в production.

## Этап 2 — интеграция Check Point (как включить)

1. Заполните в `.env` блок `CP_MGMT_*` (хост, учётка/API-ключ, `CP_MGMT_TLS_VERIFY=true`).
2. **Подтвердите команды на стенде** (без этого в прод не переключать):
   ```bash
   npm run poc                            # login + версии API (безопасно)
   npm run poc -- --show-user <тест-юзер> # посмотреть структуру сертификатов
   npm run poc -- --issue-regkey <тест-юзер>
   npm run poc -- --issue-p12   <тест-юзер>   # затем: openssl pkcs12 -info -in poc-output.p12
   ```
   Скрипт печатает «сырой» JSON ответа Check Point.
3. Если имена полей отличаются от вашей версии — правится **только один файл**:
   `src/services/checkpoint/payloads.js` (билдеры payload и экстракторы).
4. Переключите режим: `CERT_ISSUANCE_MODE=registration-key` (рекомендуется) или `p12`.

Что уже реализовано в адаптерах:
- `RegistrationKeyAdapter`: `ensureUser` → `set-user` (добавление сертификата с
  уникальным комментарием) → `publish` → чтение ключа по комментарию (устойчиво
  к наличию у пользователя других сертификатов).
- `P12Adapter`: то же + декодирование base64 `.p12` из ответа на диск.
- Развилка по идентичности: `CP_USER_MANAGEMENT=internal` (локальная база) или
  `ldap` (тогда выпуск — через ICA management tool, не через этот путь API).

Версионная оговорка: экспорт `.p12` через API исторически имел баг на
R80.30/R80.40/R81 (чинился JHF) — проверьте `openssl` перед включением `p12`.

## Дорожная карта (следующие этапы)

- **Этап 3 — фронтенд под стиль DOGMA**: форма ФИО → статус → получение
  сертификата; светлая минималистичная тема, логотип DOGMA.
- **Этап 4 — доставка пароля out-of-band** (e-mail/SMS), отзыв сертификатов.
- **Этап 5 — аутентификация портала** (SSO/AD), вынос БД (PostgreSQL) и очереди
  (BullMQ/Redis), RBAC на admin-эндпоинты, хардненинг, тесты, деплой.

## Открытые вопросы (блокируют Этап 2)

1. «Ключ-сертификат» — это `.p12`-файл или registration key?
2. Версия Check Point (для точных команд Management API / `cpca_client`).
3. Автовыпуск или с апрувом.
4. Пользователи — сотрудники (есть AD) или внешние.
