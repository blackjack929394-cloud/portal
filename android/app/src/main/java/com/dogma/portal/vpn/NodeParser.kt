package com.dogma.portal.vpn

import com.dogma.portal.data.ProxyNode
import java.net.URI
import java.net.URLDecoder

/**
 * Разбор hysteria2-ссылок из подписки портала
 * (`GET /api/v1/sub/<token>?format=links`).
 */
object NodeParser {

    fun parseLines(text: String): List<ProxyNode> = text
        .lineSequence()
        .map { it.trim() }
        .filter { it.isNotEmpty() && !it.startsWith("#") }
        .mapNotNull { parse(it) }
        .distinctBy { "${it.name}|${it.host}|${it.port}" }
        .toList()

    fun parse(raw: String): ProxyNode? {
        val lower = raw.lowercase()
        if (!lower.startsWith("hysteria2://") && !lower.startsWith("hy2://")) return null
        return runCatching {
            val normalized = if (lower.startsWith("hy2://")) {
                "hysteria2://" + raw.substringAfter("://")
            } else {
                raw
            }
            val uri = URI(normalized)
            val host = uri.host ?: return null
            if (host.isBlank()) return null
            val port = if (uri.port > 0) uri.port else 443
            val password = uri.rawUserInfo?.let { decode(it) }.orEmpty()
            val query = parseQuery(uri.rawQuery)
            val name = uri.rawFragment
                ?.let { decode(it) }
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
                ?: "$host:$port"
            ProxyNode(
                name = name,
                host = host,
                port = port,
                password = password,
                sni = query["sni"] ?: query["peer"] ?: host,
                insecure = query["insecure"].let { it == "1" || it == "true" } ||
                    query["allowinsecure"].let { it == "1" || it == "true" },
                pinSha256 = query["pinsha256"]?.takeIf { it.isNotBlank() },
                obfs = query["obfs"]?.takeIf { it.equals("salamander", true) },
                obfsPassword = query["obfs-password"] ?: query["obfspassword"],
                raw = raw,
            )
        }.getOrNull()
    }

    private fun parseQuery(raw: String?): Map<String, String> {
        if (raw.isNullOrBlank()) return emptyMap()
        return raw.split('&').mapNotNull { part ->
            if (part.isBlank()) return@mapNotNull null
            val i = part.indexOf('=')
            if (i <= 0) {
                decode(part).lowercase() to ""
            } else {
                decode(part.substring(0, i)).lowercase() to decode(part.substring(i + 1))
            }
        }.toMap()
    }

    private fun decode(value: String): String = runCatching {
        URLDecoder.decode(value, "UTF-8")
    }.getOrDefault(value)
}
