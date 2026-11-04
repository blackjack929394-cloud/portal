# Страница скачивания клиентов (`/download`)

На сайте появилась отдельная страница с клиентами для **Android** и **Windows**.
Она берёт метаданные из публичного API `GET /api/v1/clients`, поэтому версии и
ссылки можно менять без пересборки фронтенда.

## Вариант 1. Внешние ссылки (GitHub Releases / CDN)

Самый простой путь для продакшена. Задайте в `backend/.env`:

```env
ANDROID_CLIENT_URL=https://github.com/org/repo/releases/download/v1.2.0/dogma-android.apk
ANDROID_CLIENT_VERSION=1.2.0
ANDROID_CLIENT_REQUIREMENTS=Android 8.0+
ANDROID_CLIENT_SHA256=<sha256>

WINDOWS_CLIENT_URL=https://github.com/org/repo/releases/download/v1.2.0/dogma-windows-setup.exe
WINDOWS_CLIENT_VERSION=1.2.0
WINDOWS_CLIENT_REQUIREMENTS=Windows 10/11 (x64)
WINDOWS_CLIENT_SHA256=<sha256>
```

Перезапустите backend. Страница покажет версию, требования и кнопку
«Скачать», ведущую на внешний URL.

## Вариант 2. Локальные файлы

Положите установочные файлы в `backend/public/downloads` (каталог создаётся
при деплое, в git он пустой):

```
backend/public/downloads/dogma-android-1.2.0.apk
backend/public/downloads/dogma-windows-1.2.0.exe
```

Сервис сам найдёт самый свежий `.apk` и `.exe`/`.msi`, посчитает размер и
отдаст файл по ссылке:

```
GET /api/v1/clients/android/download
GET /api/v1/clients/windows/download
```

Версию можно не задавать — она попробует извлечься из имени файла
(`dogma-android-1.2.0.apk` → `1.2.0`). Каталог можно переопределить:

```env
CLIENT_DOWNLOAD_DIR=/var/lib/dogma/downloads
```

## API

`GET /api/v1/clients` — публичный, без авторизации:

```json
{
  "clients": [
    {
      "id": "android",
      "platform": "Android",
      "name": "Dogma для Android",
      "description": "…",
      "version": "1.2.0",
      "requirements": "Android 8.0+",
      "sha256": null,
      "sizeBytes": 48234496,
      "updatedAt": "2026-11-04T10:00:00.000Z",
      "fileName": "dogma-android-1.2.0.apk",
      "external": false,
      "available": true,
      "downloadUrl": "https://vpn.example.com/api/v1/clients/android/download"
    }
  ]
}
```

Если файла нет и URL не задан, `available: false`, а на странице отображается
«Скоро» вместо кнопки скачивания.

## Как это связано с QR-входом

На странице есть блок «Три шага до подключения»: скачать клиент → открыть
личный кабинет → нажать «Войти по QR» и подтвердить устройство. Подробности
протокола — в `docs/APP_QR_LOGIN.md`.

## Проверка

```bash
curl -s http://localhost:8080/api/v1/clients | jq
curl -sI http://localhost:8080/api/v1/clients/android/download
```
