package com.dogma.portal.vpn

import com.dogma.portal.data.AppSettings
import org.json.JSONArray
import org.json.JSONObject

/**
 * Готовый sing-box-конфиг портала (`?format=singbox`) уже содержит DNS,
 * правила маршрутизации, selector нод и hysteria2-outbounds. Берём его
 * целиком, чтобы сохранить маршрутизацию, выбранную в веб-портале.
 *
 * Правим только то, что специфично для Android и libbox 1.14:
 *  - оставляем только TUN inbound (mixed на 127.0.0.1:2080 не нужен);
 *  - ставим MTU 1500;
 *  - strict_route = Kill Switch;
 *  - selector «proxy» переключаем на выбранную ноду;
 *  - `pin_sha256` (поле sing-box 1.15) заменяем на insecure для 1.14.
 */
object SmartConfig {

    fun prepare(raw: String, selectedTag: String, settings: AppSettings): String {
        val root = JSONObject(raw)

        var tun: JSONObject? = null
        root.optJSONArray("inbounds")?.let { inbounds ->
            for (i in 0 until inbounds.length()) {
                val item = inbounds.optJSONObject(i) ?: continue
                if (item.optString("type") == "tun") {
                    tun = item
                    break
                }
            }
        }
        val tunObject = tun ?: JSONObject()
            .put("type", "tun")
            .put("tag", "tun-in")
            .put("address", JSONArray().put("172.19.0.1/30"))
            .put("auto_route", true)
            .put("stack", "mixed")
        tunObject.put("mtu", 1500)
        tunObject.put("strict_route", settings.killSwitch)
        root.put("inbounds", JSONArray().put(tunObject))

        val outbounds = root.optJSONArray("outbounds") ?: JSONArray()
        var selector: JSONObject? = null
        val hysteriaTags = mutableListOf<String>()

        for (i in 0 until outbounds.length()) {
            val outbound = outbounds.optJSONObject(i) ?: continue
            val type = outbound.optString("type")
            if (type == "hysteria2") hysteriaTags.add(outbound.optString("tag"))
            if (type == "selector" && outbound.optString("tag") == "proxy") selector = outbound

            val tls = outbound.optJSONObject("tls")
            if (tls != null && tls.has("pin_sha256")) {
                tls.remove("pin_sha256")
                tls.put("insecure", true)
            }
        }

        if (selector == null && hysteriaTags.isNotEmpty()) {
            val created = JSONObject()
                .put("type", "selector")
                .put("tag", "proxy")
                .put("outbounds", JSONArray(hysteriaTags))
                .put("default", hysteriaTags.first())
            val rebuilt = JSONArray().put(created)
            for (i in 0 until outbounds.length()) rebuilt.put(outbounds.get(i))
            root.put("outbounds", rebuilt)
        } else if (selector != null) {
            val list = selector.optJSONArray("outbounds") ?: JSONArray()
            val tags = (0 until list.length())
                .map { list.optString(it) }
                .filter { it.isNotBlank() }
            if (selectedTag in tags) {
                val ordered = listOf(selectedTag) + tags.filter { it != selectedTag }
                selector.put("outbounds", JSONArray(ordered))
                selector.put("default", selectedTag)
            }
        }

        return root.toString(2)
    }
}
