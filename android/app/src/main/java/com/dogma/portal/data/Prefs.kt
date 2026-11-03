package com.dogma.portal.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.dogma.portal.BuildConfig
import okhttp3.Cookie
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * Локальные настройки клиента: сессия портала, адрес сервера, язык,
 * параметры VPN (как в desktop-версии) и выбранный узел.
 *
 * Cookie — фактически bearer-токен, поэтому храним его в
 * EncryptedSharedPreferences (с откатом на обычные prefs, если keystore
 * на устройстве недоступен).
 */
class Prefs(context: Context) {

    private val sp: SharedPreferences = createStore(context.applicationContext)

    var baseUrl: String
        get() = normalizeBaseUrl(sp.getString(KEY_BASE_URL, null) ?: BuildConfig.PORTAL_BASE_URL)
        set(value) = sp.edit().putString(KEY_BASE_URL, normalizeBaseUrl(value)).apply()

    var lang: String
        get() = sp.getString(KEY_LANG, "ru") ?: "ru"
        set(value) = sp.edit().putString(KEY_LANG, value).apply()

    var userName: String?
        get() = sp.getString(KEY_USER_NAME, null)
        set(value) = sp.edit().putString(KEY_USER_NAME, value).apply()

    var userEmail: String?
        get() = sp.getString(KEY_USER_EMAIL, null)
        set(value) = sp.edit().putString(KEY_USER_EMAIL, value).apply()

    var cookie: String?
        get() = sp.getString(KEY_COOKIE, null)
        set(value) = sp.edit().putString(KEY_COOKIE, value).apply()

    // ── настройки VPN-клиента ────────────────────────────────────────────────

    var theme: String
        get() = sp.getString(KEY_THEME, "system") ?: "system"
        set(value) = sp.edit().putString(KEY_THEME, value).apply()

    var killSwitch: Boolean
        get() = sp.getBoolean(KEY_KILL_SWITCH, false)
        set(value) = sp.edit().putBoolean(KEY_KILL_SWITCH, value).apply()

    var autostart: Boolean
        get() = sp.getBoolean(KEY_AUTOSTART, false)
        set(value) = sp.edit().putBoolean(KEY_AUTOSTART, value).apply()

    var leakProtection: Boolean
        get() = sp.getBoolean(KEY_LEAK, true)
        set(value) = sp.edit().putBoolean(KEY_LEAK, value).apply()

    var dns: String
        get() = sp.getString(KEY_DNS, "1.1.1.1") ?: "1.1.1.1"
        set(value) = sp.edit().putString(KEY_DNS, value).apply()

    var splitTunneling: String
        get() = sp.getString(KEY_SPLIT, "") ?: ""
        set(value) = sp.edit().putString(KEY_SPLIT, value).apply()

    var favorites: Set<String>
        get() = sp.getStringSet(KEY_FAVORITES, emptySet())?.toSet() ?: emptySet()
        set(value) = sp.edit().putStringSet(KEY_FAVORITES, value.toSet()).apply()

    var lastServer: String?
        get() = sp.getString(KEY_LAST_SERVER, null)
        set(value) = sp.edit().putString(KEY_LAST_SERVER, value).apply()

    /** Сырая hysteria2-ссылка выбранного узла (для восстановления после перезапуска). */
    var selectedNodeRaw: String?
        get() = sp.getString(KEY_SELECTED_NODE, null)
        set(value) = sp.edit().putString(KEY_SELECTED_NODE, value).apply()

    /** Smart-конфиг портала (format=singbox) с DNS и маршрутизацией. */
    var smartConfig: String?
        get() = sp.getString(KEY_SMART_CONFIG, null)
        set(value) = sp.edit().putString(KEY_SMART_CONFIG, value).apply()

    fun settings(): AppSettings = AppSettings(
        theme = when (theme) {
            "dark" -> ThemeMode.DARK
            "light" -> ThemeMode.LIGHT
            else -> ThemeMode.SYSTEM
        },
        killSwitch = killSwitch,
        autostart = autostart,
        leakProtection = leakProtection,
        dns = dns,
        splitTunneling = splitTunneling,
        favorites = favorites,
        lastServer = lastServer,
    )

    fun clearSession() {
        sp.edit().remove(KEY_COOKIE).remove(KEY_USER_NAME).remove(KEY_USER_EMAIL).apply()
    }

    fun encodeCookie(cookie: Cookie): String = listOf(
        cookie.name,
        cookie.value,
        cookie.domain,
        cookie.path,
        cookie.expiresAt.toString(),
        if (cookie.secure) "1" else "0",
        if (cookie.hostOnly) "1" else "0",
        if (cookie.httpOnly) "1" else "0",
    ).joinToString(SEP)

    fun decodeCookie(raw: String): Cookie? {
        val p = raw.split(SEP)
        if (p.size != 8) return null
        return runCatching {
            Cookie.Builder()
                .name(p[0])
                .value(p[1])
                .apply { if (p[6] == "1") hostOnlyDomain(p[2]) else domain(p[2]) }
                .path(p[3])
                .expiresAt(p[4].toLong())
                .apply {
                    if (p[5] == "1") secure()
                    if (p[7] == "1") httpOnly()
                }
                .build()
        }.getOrNull()
    }

    companion object {
        private const val SEP = "\u001F"
        private const val KEY_BASE_URL = "base_url"
        private const val KEY_LANG = "lang"
        private const val KEY_COOKIE = "cookie"
        private const val KEY_USER_NAME = "user_name"
        private const val KEY_USER_EMAIL = "user_email"
        private const val KEY_THEME = "theme"
        private const val KEY_KILL_SWITCH = "kill_switch"
        private const val KEY_AUTOSTART = "autostart"
        private const val KEY_LEAK = "leak_protection"
        private const val KEY_DNS = "dns"
        private const val KEY_SPLIT = "split_tunneling"
        private const val KEY_FAVORITES = "favorites"
        private const val KEY_LAST_SERVER = "last_server"
        private const val KEY_SELECTED_NODE = "selected_node"
        private const val KEY_SMART_CONFIG = "smart_config"

        fun normalizeBaseUrl(raw: String): String {
            var s = raw.trim()
            if (s.isEmpty()) return s
            if (!s.startsWith("http://") && !s.startsWith("https://")) s = "http://$s"
            return s.trimEnd('/')
        }

        fun isValidBaseUrl(raw: String): Boolean {
            val normalized = normalizeBaseUrl(raw)
            val url = normalized.toHttpUrlOrNull() ?: return false
            return url.host.isNotBlank() && (url.scheme == "http" || url.scheme == "https")
        }

        private fun createStore(context: Context): SharedPreferences = try {
            // security-crypto 1.0.0: MasterKeys вместо MasterKey из 1.1.x.
            val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
            EncryptedSharedPreferences.create(
                "dogma_secure",
                masterKeyAlias,
                context,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
            )
        } catch (_: Throwable) {
            context.getSharedPreferences("dogma_fallback", Context.MODE_PRIVATE)
        }
    }
}
