package com.dogma.portal.vpn

import com.dogma.portal.data.AppSettings
import com.dogma.portal.data.ProxyNode
import org.json.JSONArray
import org.json.JSONObject

/**
 * sing-box-конфиг для нативного подключения. Ядро — libbox (sing-box),
 * outbound — hysteria2; маршрутизация повторяет desktop-клиент:
 * весь трафик в туннель, локальная сеть напрямую, домены из
 * «раздельного туннелирования» — мимо VPN.
 */
object SingBoxConfig {

    fun build(node: ProxyNode, settings: AppSettings): String {
        require(node.host.isNotBlank()) { "Node host is empty" }
        require(node.password.isNotBlank()) { "Node password is empty" }

        val root = JSONObject()
        root.put("log", JSONObject().put("level", "warn").put("timestamp", false))
        root.put("dns", buildDns(settings))
        root.put("inbounds", JSONArray().put(buildTun(settings)))
        root.put(
            "outbounds",
            JSONArray()
                .put(buildHysteria2(node))
                .put(JSONObject().put("type", "direct").put("tag", "direct"))
                .put(JSONObject().put("type", "block").put("tag", "block")),
        )
        root.put("route", buildRoute(settings))
        return root.toString(2)
    }

    private fun buildDns(settings: AppSettings): JSONObject {
        val servers = JSONArray()
        servers.put(
            JSONObject()
                .put("type", "udp")
                .put("tag", "dns-remote")
                .put("server", settings.dns.ifBlank { "1.1.1.1" })
                .put("detour", "proxy"),
        )
        servers.put(
            JSONObject()
                .put("type", "local")
                .put("tag", "dns-local")
                .put("detour", "direct"),
        )
        return JSONObject()
            .put("servers", servers)
            .put("final", if (settings.leakProtection) "dns-remote" else "dns-local")
            .put("strategy", "ipv4_only")
    }

    private fun buildTun(settings: AppSettings): JSONObject {
        return JSONObject()
            .put("type", "tun")
            .put("tag", "tun-in")
            // sing-box 1.12+: address вместо legacy inet4_address.
            .put("address", JSONArray().put("172.19.0.1/30"))
            .put("mtu", 1500)
            .put("auto_route", true)
            // strict_route не даёт приложениям обойти туннель; он же —
            // лучшая нативная аппроксимация Kill Switch.
            .put("strict_route", settings.killSwitch || settings.leakProtection)
            .put("stack", "mixed")
    }

    private fun buildHysteria2(node: ProxyNode): JSONObject {
        val out = JSONObject()
            .put("type", "hysteria2")
            .put("tag", "proxy")
            .put("server", node.host)
            .put("server_port", node.port)
            .put("password", node.password)
        if (!node.obfs.isNullOrBlank() && !node.obfsPassword.isNullOrBlank()) {
            out.put(
                "obfs",
                JSONObject()
                    .put("type", node.obfs)
                    .put("password", node.obfsPassword),
            )
        }
        out.put(
            "tls",
            JSONObject()
                .put("enabled", true)
                .put("server_name", node.sni.ifBlank { node.host })
                // libbox 1.14 не умеет certificate_sha256 (появился в 1.15),
                // а pinSHA256 в ссылке — хэш всего сертификата. Чтобы подключение
                // работало, при наличии пина отключаем проверку CA (как fallback).
                .put("insecure", node.insecure || !node.pinSha256.isNullOrBlank())
                .put("alpn", JSONArray().put("h3")),
        )
        return out
    }

    private fun buildRoute(settings: AppSettings): JSONObject {
        val rules = JSONArray()
        rules.put(JSONObject().put("action", "sniff"))
        rules.put(JSONObject().put("protocol", "dns").put("action", "hijack-dns"))
        rules.put(JSONObject().put("ip_is_private", true).put("outbound", "direct"))

        val directDomains = splitDomains(settings.splitTunneling)
        if (directDomains.isNotEmpty()) {
            rules.put(
                JSONObject()
                    .put("domain_suffix", JSONArray(directDomains))
                    .put("outbound", "direct"),
            )
        }

        return JSONObject()
            .put("auto_detect_interface", true)
            .put("default_domain_resolver", "dns-local")
            .put("rules", rules)
            .put("final", "proxy")
    }

    private fun splitDomains(text: String): List<String> = text
        .split(Regex("[\\s,;]+"))
        .map { raw ->
            raw.trim()
                .removePrefix("http://")
                .removePrefix("https://")
                .removePrefix("*.")
                .removePrefix(".")
                .trimEnd('/')
                .lowercase()
        }
        .filter { it.isNotEmpty() && it.contains('.') }
        .distinct()
}
