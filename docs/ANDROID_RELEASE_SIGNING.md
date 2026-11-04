# Android: релизная сборка и подпись

## Ключ

Релизный ключ создан в `android/keystore/dogma-release.jks`, параметры — в
`android/keystore.properties`. Оба файла исключены из git.

**Обязательно сделайте резервную копию keystore и пароля.** Потеря ключа
означает невозможность обновлять уже установленные приложения — придётся
выпускать новый пакет с другим applicationId.

## Сборка

```powershell
cd android
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-17'
.\gradlew.bat :app:assembleRelease
```

Результат: `android/app/build/outputs/apk/release/app-release.apk`.

Проверка подписи:

```powershell
apksigner verify --print-certs app\build\outputs\apk\release\app-release.apk
```

Сборка подписана схемами v1/v2, `applicationId = com.dogma.portal`,
`versionName = 2.2.1`.

## Play Protect и предупреждения

- Релизная подпись обязательна: debug-APK выглядит для Android как отладочная
  сборка и чаще вызывает предупреждения.
- При установке из браузера Android всё равно может показывать
  «Небезопасное приложение» / «Установка из неизвестного источника» —
  это политика Play Protect для любого APK вне Google Play.
- Полностью убрать предупреждение можно только публикацией в Google Play
  (или через managed Google Play для корпоративных устройств).
- Для внутреннего распространения используйте MDM/управляемые профили или
  добавьте приложение в allowlist Play Protect.
