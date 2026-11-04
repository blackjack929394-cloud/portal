# Dogma Web для Windows

Electron-обёртка личного кабинета Dogma Web с локальным ядром sing-box.

## Что внутри

- Личный кабинет, подписка, маршрутизация, устройства и чат — интерфейс портала.
- Кнопка «Подключиться» внизу слева: получает smart-подписку из портала,
  запускает `sing-box.exe` и включает системный прокси Windows.
- Канал обновлений — сам портал: обновление сайта сразу видно в приложении.
- EULA прилагается (`EULA.md`).

## Сборка

```powershell
cd windows
npm install
npm run fetch:singbox
# распакуйте sing-box.exe из скачанного архива в windows/bin/sing-box.exe
npm run dist
```

Готовый установщик: `windows/dist/DogmaWeb-Setup-1.0.0.exe`.

## Подпись и SmartScreen

Windows Defender SmartScreen предупреждает неподписанные приложения и приложения
без репутации. **Самостоятельно подписанный сертификат (self-signed) эту проблему
не решает** — Windows ему не доверяет.

Чтобы предупреждения не было, нужен сертификат подписи кода от доверенного
удостоверяющего центра (OV или, лучше, EV Code Signing). EV-сертификат обычно
даёт репутацию сразу, OV — по мере загрузок.

После получения `.pfx`:

```powershell
./scripts/sign-windows.ps1 -PfxPath C:\path\dogma.pfx -PfxPassword "***"
```

Скрипт подписывает `Dogma Web.exe` и установщик, ставит timestamp. Для сборки,
где electron-builder сам подписывает файлы, задайте переменные:

```powershell
$env:CSC_LINK = "C:\path\dogma.pfx"
$env:CSC_KEY_PASSWORD = "***"
npm run dist
```

Без сертификата установщик собирается, но SmartScreen будет показывать
«Неизвестный издатель» — это ограничение Windows, а не ошибка приложения.

## Лицензия

Проприетарная EULA. Копия открывается в приложении: «Помощь → Лицензия».
