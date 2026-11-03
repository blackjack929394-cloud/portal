package com.dogma.portal.util

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.dogma.portal.ui.Strings
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

fun formatBytes(bytes: Long, t: Strings): String {
    if (bytes < 1024) return "$bytes ${t["b"]}"
    if (bytes < 1024L * 1024L) return String.format(Locale.US, "%.1f %s", bytes / 1024.0, t["kb"])
    if (bytes < 1024L * 1024L * 1024L) return String.format(Locale.US, "%.1f %s", bytes / 1048576.0, t["mb"])
    return String.format(Locale.US, "%.2f %s", bytes / 1073741824.0, t["gb"])
}

fun formatSpeed(bytesPerSecond: Double, t: Strings): String {
    if (bytesPerSecond <= 0) return "0 ${t["kbps"]}"
    val mbit = bytesPerSecond * 8 / 1_000_000.0
    return if (mbit < 1) {
        val kbps = (bytesPerSecond / 1024.0).roundToInt().coerceAtLeast(0)
        "$kbps ${t["kbps"]}"
    } else {
        String.format(Locale.US, "%.1f %s", mbit, t["mbit"])
    }
}

fun formatClock(seconds: Long): String {
    val safe = seconds.coerceAtLeast(0)
    val h = safe / 3600
    val m = (safe % 3600) / 60
    val s = safe % 60
    return String.format(Locale.US, "%02d:%02d:%02d", h, m, s)
}

fun formatDuration(seconds: Long, t: Strings): String {
    val safe = seconds.coerceAtLeast(0)
    val h = safe / 3600
    val m = (safe % 3600) / 60
    return when {
        h > 0 -> "$h${t["hourShort"]} $m${t["minShort"]}"
        m > 0 -> "$m${t["minShort"]}"
        else -> "$safe${t["secShort"]}"
    }
}

fun formatDate(iso: String?): String {
    if (iso.isNullOrBlank()) return "—"
    val raw = iso.substringBefore('T')
    val parser = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    val date = runCatching { parser.parse(raw) }.getOrNull() ?: return raw
    return SimpleDateFormat("dd.MM.yyyy", Locale.US).format(date)
}

fun formatTime(iso: String?): String {
    if (iso.isNullOrBlank()) return ""
    val cleaned = iso.replace("Z", "").substringBefore('.')
    val patterns = listOf("yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd HH:mm:ss")
    for (pattern in patterns) {
        val parsed = runCatching {
            SimpleDateFormat(pattern, Locale.US).parse(cleaned)
        }.getOrNull()
        if (parsed != null) {
            return SimpleDateFormat("HH:mm", Locale.US).format(Date(parsed.time))
        }
    }
    return ""
}

fun openExternal(context: Context, url: String): Boolean = runCatching {
    context.startActivity(
        Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    )
    true
}.getOrDefault(false)
