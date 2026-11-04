package com.dogma.portal.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class User(
    val name: String? = null,
    val email: String? = null,
    val kind: String? = null,
)

@Serializable
data class AuthConfig(val sso: Boolean = false)

@Serializable
data class Subscription(
    val id: String? = null,
    val status: String? = null,
    val expiresAt: String? = null,
    val trafficLimitGb: Double? = null,
    val trafficUsedGb: Double? = null,
    val token: String? = null,
    val activeNodeCount: Int? = null,
    val subscriptionUrl: String? = null,
    val smartSubscriptionUrl: String? = null,
    val secureSubscriptionUrl: String? = null,
    val configLink: String? = null,
)

@Serializable
data class RoutingProfile(
    val mode: String = "global",
    val ruDirect: Boolean = true,
    val presets: List<String> = emptyList(),
    val proxyDomains: List<String> = emptyList(),
    val directDomains: List<String> = emptyList(),
)

@Serializable
data class RoutingPreset(val id: String, val label: String)

@Serializable
data class RoutingResponse(
    val profile: RoutingProfile = RoutingProfile(),
    val presets: List<RoutingPreset> = emptyList(),
)

@Serializable
data class ChatMessage(
    val id: String = "",
    val sender: String = "user",
    val text: String = "",
    val createdAt: String? = null,
)

@Serializable
data class ChatResponse(val messages: List<ChatMessage> = emptyList())

@Serializable
data class UnreadResponse(val unread: Int = 0)

// ── QR-вход из личного кабинета ─────────────────────────────────────────────

/** В QR-сессиях имя/почта могут быть null — не переиспользуем строгий User. */
@Serializable
data class QrUser(
    val name: String? = null,
    val email: String? = null,
    val kind: String? = null,
)

@Serializable
data class QrSession(
    val id: String = "",
    val status: String = "",
    val deviceName: String? = null,
    val platform: String? = null,
    val appVersion: String? = null,
    val expiresAt: String? = null,
    val user: QrUser? = null,
)

@Serializable
data class QrClaim(
    val token: String = "",
    val tokenType: String = "Bearer",
    val expiresAt: String? = null,
    val user: QrUser? = null,
)

@Serializable
data class ApiErrorBody(
    val error: String? = null,
    val message: String? = null,
    val details: JsonElement? = null,
)

// ── Desktop-style VPN client models ─────────────────────────────────────────

enum class ThemeMode { SYSTEM, DARK, LIGHT }

data class AppSettings(
    val theme: ThemeMode = ThemeMode.SYSTEM,
    val killSwitch: Boolean = false,
    val autostart: Boolean = false,
    val leakProtection: Boolean = true,
    val dns: String = "1.1.1.1",
    val splitTunneling: String = "",
    val favorites: Set<String> = emptySet(),
    val lastServer: String? = null,
)

/**
 * Узел из подписки. Desktop-клиент берёт hysteria2-ссылки
 * (`GET /api/v1/sub/<token>?format=links`), здесь — то же самое.
 */
@Serializable
data class ProxyNode(
    val name: String,
    val host: String,
    val port: Int = 443,
    val password: String = "",
    val sni: String = "www.bing.com",
    val insecure: Boolean = false,
    val pinSha256: String? = null,
    val obfs: String? = null,
    val obfsPassword: String? = null,
    val raw: String = "",
) {
    val hostPort: String get() = "$host:$port"
}

@Serializable
data class DayStats(
    val up: Long = 0,
    val down: Long = 0,
    val seconds: Long = 0,
)

@Serializable
data class StatsData(
    val days: Map<String, DayStats> = emptyMap(),
    val lastServerName: String? = null,
)

data class SpeedPoint(val down: Double, val up: Double)

