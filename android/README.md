# Dogma VPN — Android-клиент

Нативное приложение на Kotlin + Jetpack Compose в визуальном стиле
веб-портала DOGMA: тёплая тёмная палитра, кремовый текст, золотой акцент,
Inter и JetBrains Mono.

## Экраны

- **Главная** — круг с логотипом приложения. Круг — кнопка подключения:
  нажатие поднимает или опускает туннель. Ниже статус, IP/время сессии
  и выбранный сервер.
- **Серверы** — ноды из подписки, поиск, избранное, пинг.
- **Настройки** — Kill Switch, автозапуск и переход к маршрутизации
  в веб-портале.
- **Статистика** — трафик за сегодня/неделю/месяц/год, график скорости,
  время подключения и последний сервер.
- **Профиль** — аккаунт, статус подписки, поддержка, выход.
- **Чат** — переписка с администратором и счётчик непрочитанных.

## Вход

- Логин и пароль.
- **SSO через Google** (`/auth/login` → OIDC → cookie `dogma.sid`
  переносится в сессию приложения). Google открывается в WebView
  с обычным мобильным Chrome User-Agent.

## Маршрутизация из портала

После входа приложение запрашивает не только список нод, но и готовую
smart-подписку:

```
GET /api/v1/sub/<token>?format=singbox
```

Этот JSON содержит DNS, правила маршрутизации, selector нод и
hysteria2-outbounds. Он используется как основа конфига, поэтому
сохраняются все правила, выбранные в веб-портале (RU-напрямую,
сервисы, свои домены и исключения).

Перед запуском конфиг адаптируется под Android/libbox 1.14:

- остаётся только TUN inbound, `mixed` на `127.0.0.1:2080` убирается;
- MTU ставится 1500;
- `strict_route` управляется Kill Switch;
- selector `proxy` переключается на выбранную ноду;
- `pin_sha256` (поле sing-box 1.15) заменяется на `insecure`, потому что
  libbox 1.14 ещё не умеет `certificate_sha256`.

Если smart-конфиг недоступен, используется резервный конфиг из
hysteria2-ссылки.

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

Сервер по умолчанию — `https://192-144-56-63.sslip.io`. Переопределяется
при сборке:

```bash
./gradlew assembleDebug -PportalBaseUrl=https://vpn.example.com
```

Адрес также меняется в приложении: иконка шестерёнки в шапке.

## Архитектура

```
app/src/main/java/com/dogma/portal/
  AppViewModel.kt          auth, подписка, ноды, чат, статистика, VPN
  data/
    ApiClient.kt           OkHttp + cookie dogma.sid
    PortalRepository.kt    /auth/*, /api/v1/vpn/*, /api/v1/chat, /api/v1/sub/*
    Models.kt              User, Subscription, ProxyNode, AppSettings, StatsData
    Prefs.kt               настройки, выбранная нода, cookie, smart-конфиг
  vpn/
    DogmaVpnService.kt     foreground VpnService, CommandServer (libbox)
    LibboxPlatform.kt      PlatformInterface: TUN, protect(), интерфейсы
    SmartConfig.kt         адаптация smart-конфига портала под Android
    SingBoxConfig.kt       резервный конфиг из hysteria2-ссылки
    NodeParser.kt          разбор hysteria2:// из подписки
    VpnRuntime.kt          StateFlow состояния VPN для UI
    VpnManager.kt          запуск/остановка сервиса
    BootReceiver.kt        автозапуск после перезагрузки
  stats/StatsStore.kt      суточная статистика
  ui/
    MainScreen.kt          контент + нижняя навигация
    auth/                  вход, регистрация, SSO WebView
    home/                  круг-кнопка, статус, сервер, шлюз подписки
    servers/               список серверов
    settings/              Kill Switch, автозапуск, маршрутизация
    stats/                 статистика
    profile/               профиль
    chat/                  чат поддержки
    components/            шапка, панели, кнопки, поля, иконки, график
    theme/                 палитра и типографика портала
    Strings.kt             RU/EN
```

## Ограничения

- `pinSHA256` из smart-конфига — хэш всего сертификата. В libbox 1.14
  поле `certificate_sha256` ещё не поддерживается (появилось в 1.15),
  поэтому для подключения TLS-проверка отключается (`insecure`).
  Для строгой проверки нужен libbox ≥ 1.15.
- Google может ограничивать OAuth во встроенных браузерах. Используется
  мобильный Chrome User-Agent; при отказе провайдера остаётся вход по
  логину и паролю.
- Автозапуск после перезагрузки — best-effort: Android может запретить
  старт foreground-сервиса из `BOOT_COMPLETED`.
- Статистика трафика считается по `TrafficStats` устройства и является
  приблизительной.
- `android:usesCleartextTraffic="true"` оставлен для локальной
  разработки; для продакшена используется HTTPS.

## Лицензия ядра

`libbox`/`sing-box` распространяется под **GPL-3.0-or-later**. AAR не
хранится в git и скачивается при сборке; при распространении APK нужно
соблюдать условия GPL. Код самого Android-клиента этим не
перелицензируется.

## Проверка

Проверено на эмуляторе Android 14 (x86_64): вход по сохранённой сессии,
загрузка smart-конфига портала, реальное Hysteria2-подключение,
`using portal smart config` в логах, смена внешнего IP, клик по кругу
для disconnect/reconnect, экраны серверов, настроек, статистики,
профиля и чата, а также загрузка страницы Google в SSO WebView.
