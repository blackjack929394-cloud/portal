# Dogma VPN — Android-клиент

Нативное Android-приложение на Kotlin + Jetpack Compose, повторяющее
desktop-клиент Dogma VPN: тёмный/светлый интерфейс, подключение через
Hysteria2 (sing-box / libbox), список серверов, настройки, статистика,
профиль и чат поддержки.

## Экраны

- **Главная** — кольцо подключения, статус, IP/протокол/время сессии,
  выбор сервера, кнопка подключения, шлюз подписки (нет доступа /
  на рассмотрении / отклонено).
- **Серверы** — hysteria2-ноды из подписки (`?format=links`), поиск,
  избранное, пинг, выбор узла.
- **Настройки** — Kill Switch, автозапуск, DNS, защита от утечек,
  раздельное туннелирование, язык, тема, адрес портала.
- **Статистика** — сегодня/неделя/месяц/год, загружено/выгружено,
  донат, график скорости, время подключения, последний сервер.
- **Профиль** — аккаунт, статус подписки и срок действия, устройства,
  тариф/платежи (ссылки на веб-портал), поддержка, выход.
- **Чат** — переписка с администратором, счётчик непрочитанных.

## Сборка

Требования: JDK 17, Android SDK (platform 34, build-tools 34.0.0).

```bash
cd android
./gradlew assembleDebug
```

При первой сборке Gradle скачивает `libbox.aar` (sing-box, ~118 МБ) с
GitHub Releases в `app/libs/` (файл в `.gitignore`). Можно положить AAR
вручную или переопределить:

```bash
./gradlew assembleDebug -Plibbox.version=1.14.4
./gradlew assembleDebug -Plibbox.aar.url='https://…/libbox.aar'
```

APK: `app/build/outputs/apk/debug/app-debug.apk`.

Сервер по умолчанию — `https://192-144-56-63.sslip.io` (актуальный
сервер Dogma VPN). Переопределяется при сборке:

```bash
./gradlew assembleDebug -PportalBaseUrl=https://vpn.example.com
```

Адрес также меняется в приложении: Настройки → «Сервер портала».

На Windows:

```powershell
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
.\gradlew.bat assembleDebug
```

## Архитектура

```
app/src/main/java/com/dogma/portal/
  AppViewModel.kt          состояние клиента: auth, подписка, ноды,
                           настройки, чат, статистика, VPN-производные
  data/
    ApiClient.kt           OkHttp + cookie dogma.sid
    PortalRepository.kt    /auth/*, /api/v1/vpn/*, /api/v1/chat, /api/v1/sub/*
    Models.kt              User, Subscription, ProxyNode, AppSettings, StatsData
    Prefs.kt               настройки, выбранный узел, зашифрованная cookie
  vpn/
    DogmaVpnService.kt     foreground VpnService, CommandServer (libbox)
    LibboxPlatform.kt      PlatformInterface: TUN, protect(), интерфейсы
    SingBoxConfig.kt       sing-box JSON: tun + hysteria2 + DNS + route
    NodeParser.kt          разбор hysteria2:// из подписки
    VpnRuntime.kt          StateFlow состояния VPN для UI
    VpnManager.kt          запуск/остановка сервиса
    BootReceiver.kt        автозапуск после перезагрузки
  stats/StatsStore.kt      суточная статистика (как stats.json на ПК)
  ui/
    MainScreen.kt          сайдбар (планшет) / нижняя навигация (телефон)
    auth/                  вход и регистрация
    home/                  главный экран с кольцом
    servers/               список серверов
    settings/              настройки
    stats/                 статистика
    profile/               профиль
    chat/                  чат поддержки
    components/            карточки, кнопки, поля, иконки, флаги, графики
    theme/                 палитра light/dark как в desktop-клиенте
    Strings.kt             RU/EN
```

## VPN-ядро

- Ядро — **sing-box** через официальный gomobile AAR `libbox`.
- Outbound — `hysteria2` с паролем из подписки, SNI и TLS.
- TUN создаётся через наш `VpnService`; исходящие сокеты ядра
  защищаются `VpnService.protect()`.
- Маршрутизация: весь трафик в туннель, локальная сеть напрямую,
  домены из «раздельного туннелирования» — напрямую.
- Kill Switch реализован через `strict_route` sing-box (лучшее, что
  можно сделать без always-on VPN на уровне системы).
- Статистика трафика считается по `TrafficStats` (суммарный трафик
  устройства) с суточными дельтами, как в desktop-клиенте.

Проверено на эмуляторе Android 14 (x86_64): вход по сохранённой сессии,
загрузка подписки RU-DE, реальное Hysteria2-подключение, смена внешнего
IP, disconnect/reconnect, экраны серверов, настроек, статистики, профиля
и чата.

## Лицензия ядра

`libbox`/`sing-box` распространяется под **GPL-3.0-or-later**. AAR не
хранится в git и скачивается при сборке; при распространении APK нужно
соблюдать условия GPL (исходники sing-box, уведомления и т.д.). Код
самого Android-клиента этим не перелицензируется.

## Ограничения

- `pinSHA256` из ссылки — хэш всего сертификата. В libbox 1.14 поле
  `certificate_sha256` ещё не поддерживается (появилось в 1.15),
  поэтому при наличии пина TLS-проверка отключается (`insecure`).
  Для строгой проверки нужен libbox ≥ 1.15.
- Автозапуск после перезагрузки — best-effort: Android может запретить
  старт foreground-сервиса из `BOOT_COMPLETED`.
- Тарифы, оплата и история платежей в desktop-клиенте тоже являются
  заглушками — здесь они открывают веб-портал.
- `android:usesCleartextTraffic="true"` оставлен для локальной
  разработки; для продакшена используется HTTPS.
