package com.dogma.portal.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

class ApiException(
    val status: Int,
    val code: String?,
    override val message: String,
    val details: String? = null,
) : Exception(message)

class NetworkException(cause: Throwable) : Exception(cause.message, cause)

class ApiClient(private val prefs: Prefs) {

    @OptIn(kotlinx.serialization.ExperimentalSerializationApi::class)
    val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        encodeDefaults = true
    }

    private val session = SessionCookieJar(prefs)

    private val client = OkHttpClient.Builder()
        .cookieJar(session)
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    suspend fun request(method: String, pathOrUrl: String, body: String? = null): String =
        withContext(Dispatchers.IO) {
            val url = if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
                pathOrUrl
            } else {
                prefs.baseUrl + pathOrUrl
            }
            val builder = Request.Builder().url(url)
            when (method) {
                "GET" -> builder.get()
                "POST" -> builder.post((body ?: "{}").toRequestBody(JSON))
                "PUT" -> builder.put((body ?: "{}").toRequestBody(JSON))
                "PATCH" -> builder.patch((body ?: "{}").toRequestBody(JSON))
                "DELETE" -> builder.delete()
                else -> builder.method(method, body?.toRequestBody(JSON))
            }
            val response = try {
                client.newCall(builder.build()).execute()
            } catch (e: IOException) {
                throw NetworkException(e)
            }
            response.use { resp ->
                val text = resp.body?.string() ?: ""
                if (!resp.isSuccessful) {
                    val error = runCatching { json.decodeFromString<ApiErrorBody>(text) }.getOrNull()
                    throw ApiException(
                        status = resp.code,
                        code = error?.error,
                        message = error?.message ?: error?.error ?: "HTTP ${resp.code}",
                        details = detailsOf(error?.details),
                    )
                }
                text
            }
        }

    fun clearSession() = session.clear()

    fun setSessionCookie(header: String) = session.setFromHeader(header, prefs.baseUrl)

    fun hasSession(): Boolean = session.hasCookie()

    private fun detailsOf(element: JsonElement?): String? = when (element) {
        null -> null
        is JsonArray -> element.firstOrNull()?.let { item ->
            (item as? JsonObject)?.get("message")?.let { (it as? JsonPrimitive)?.contentOrNull }
                ?: (item as? JsonPrimitive)?.contentOrNull
        }
        is JsonPrimitive -> element.contentOrNull
        is JsonObject -> (element["message"] as? JsonPrimitive)?.contentOrNull
    }

    private companion object {
        val JSON = "application/json; charset=utf-8".toMediaType()
    }
}

private class SessionCookieJar(private val prefs: Prefs) : CookieJar {

    private var cookie: Cookie? = prefs.cookie?.let(prefs::decodeCookie)

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        val session = cookies.firstOrNull { it.name == "dogma.sid" } ?: cookies.lastOrNull() ?: return
        cookie = session
        prefs.cookie = prefs.encodeCookie(session)
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        val current = cookie ?: return emptyList()
        if (current.expiresAt < System.currentTimeMillis()) return emptyList()
        return if (current.matches(url)) listOf(current) else emptyList()
    }

    fun clear() {
        cookie = null
        prefs.cookie = null
    }

    /** Переносит cookie из WebView (SSO) в нашу сессию. */
    fun setFromHeader(header: String, baseUrl: String) {
        val pair = header.split(';')
            .map { it.trim() }
            .firstOrNull { it.startsWith("dogma.sid=") }
            ?: return
        val value = pair.substringAfter('=', "")
        if (value.isBlank()) return
        val url = baseUrl.toHttpUrlOrNull() ?: return
        val builder = Cookie.Builder()
            .name("dogma.sid")
            .value(value)
            .hostOnlyDomain(url.host)
            .path("/")
            .expiresAt(System.currentTimeMillis() + 8L * 60L * 60L * 1000L)
        if (url.isHttps) builder.secure()
        val built = builder.httpOnly().build()
        cookie = built
        prefs.cookie = prefs.encodeCookie(built)
    }

    fun hasCookie(): Boolean = cookie != null
}
