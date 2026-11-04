package com.dogma.portal.data

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class PortalRepository(private val prefs: Prefs) {

    private val api = ApiClient(prefs)
    private val json = api.json

    fun clearSession() {
        api.clearSession()
        prefs.clearSession()
    }

    fun setSessionCookie(header: String) = api.setSessionCookie(header)

    suspend fun me(): User? = try {
        json.decodeFromString<User>(api.request("GET", "/auth/me"))
    } catch (e: ApiException) {
        if (e.status == 401) null else throw e
    }

    suspend fun authConfig(): AuthConfig = runCatching {
        json.decodeFromString<AuthConfig>(api.request("GET", "/auth/config"))
    }.getOrDefault(AuthConfig())

    suspend fun login(username: String, password: String): User {
        val body = buildJsonObject {
            put("username", username)
            put("password", password)
        }.toString()
        return json.decodeFromString(api.request("POST", "/auth/login", body))
    }

    suspend fun register(
        fullName: String,
        email: String,
        username: String,
        password: String,
    ): User {
        val body = buildJsonObject {
            put("fullName", fullName)
            put("email", email)
            put("username", username)
            put("password", password)
        }.toString()
        return json.decodeFromString(api.request("POST", "/auth/register", body))
    }

    suspend fun logout() {
        runCatching { api.request("POST", "/auth/logout", "{}") }
        api.clearSession()
    }

    // ── Вход по QR ───────────────────────────────────────────────────────────

    suspend fun qrScan(code: String, deviceName: String, platform: String, appVersion: String): QrSession {
        val body = buildJsonObject {
            put("code", code)
            put("deviceName", deviceName)
            put("platform", platform)
            put("appVersion", appVersion)
        }.toString()
        return json.decodeFromString(api.request("POST", "/auth/app/qr/scan", body))
    }

    suspend fun qrStatus(code: String): QrSession =
        json.decodeFromString(api.request("GET", "/auth/app/qr/status?code=${encode(code)}"))

    suspend fun qrClaim(code: String): QrClaim {
        val body = buildJsonObject { put("code", code) }.toString()
        return json.decodeFromString(api.request("POST", "/auth/app/qr/claim", body))
    }

    private fun encode(value: String): String =
        java.net.URLEncoder.encode(value, "UTF-8")

    suspend fun subscription(): Subscription? = try {
        json.decodeFromString(api.request("GET", "/api/v1/vpn/subscription"))
    } catch (e: ApiException) {
        if (e.status == 404) null else throw e
    }

    suspend fun createSubscription(): Subscription {
        val sub: Subscription = json.decodeFromString(api.request("POST", "/api/v1/vpn/subscriptions", "{}"))
        return if (sub.status == null) sub.copy(status = "active") else sub
    }

    suspend fun revokeSubscription() {
        api.request("POST", "/api/v1/vpn/subscription/revoke", "{}")
    }

    suspend fun routing(): RoutingResponse =
        json.decodeFromString(api.request("GET", "/api/v1/vpn/routing"))

    suspend fun saveRouting(profile: RoutingProfile): RoutingProfile {
        val response: RoutingResponse = json.decodeFromString(
            api.request("PUT", "/api/v1/vpn/routing", json.encodeToString(profile)),
        )
        return response.profile
    }

    suspend fun chat(): List<ChatMessage> =
        json.decodeFromString<ChatResponse>(api.request("GET", "/api/v1/chat")).messages

    suspend fun unread(): Int = runCatching {
        json.decodeFromString<UnreadResponse>(api.request("GET", "/api/v1/chat/unread")).unread
    }.getOrDefault(0)

    suspend fun sendChat(text: String): ChatMessage {
        val body = buildJsonObject { put("text", text) }.toString()
        return json.decodeFromString(api.request("POST", "/api/v1/chat", body))
    }

    /**
     * Публичный (token-based) текст подписки в нужном формате:
     * wireguard, links, sub, singbox. null — формат/нода недоступны.
     */
    suspend fun subscriptionText(token: String, format: String): String? = try {
        api.request("GET", "/api/v1/sub/$token?format=$format")
    } catch (e: ApiException) {
        if (e.status == 400 || e.status == 404 || e.status == 410 || e.status == 501) null else throw e
    }

    /** Готовая smart-подписка портала: sing-box JSON с DNS и правилами маршрутизации. */
    suspend fun smartSubscription(token: String): String? = try {
        api.request("GET", "/api/v1/sub/$token?format=singbox")
    } catch (e: ApiException) {
        if (e.status == 400 || e.status == 404 || e.status == 410 || e.status == 501) null else throw e
    }
}
