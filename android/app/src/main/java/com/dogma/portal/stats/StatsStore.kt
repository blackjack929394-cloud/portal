package com.dogma.portal.stats

import android.content.Context
import com.dogma.portal.data.DayStats
import com.dogma.portal.data.StatsData
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.Calendar
import java.util.Locale

enum class StatsRange(val key: String) {
    TODAY("today"),
    WEEK("week"),
    MONTH("month"),
    YEAR("year"),
}

data class StatsSummary(
    val up: Long = 0,
    val down: Long = 0,
    val seconds: Long = 0,
    val lastServerName: String? = null,
)

/** Сводка по диапазону — общая для экрана статистики и хранилища. */
fun StatsData.summary(range: StatsRange): StatsSummary {
    val from = rangeStart(range)
    var up = 0L
    var down = 0L
    var seconds = 0L
    for ((key, day) in days) {
        val cal = dayStart(key) ?: continue
        if (cal.timeInMillis >= from) {
            up += day.up
            down += day.down
            seconds += day.seconds
        }
    }
    return StatsSummary(
        up = up,
        down = down,
        seconds = seconds,
        lastServerName = lastServerName,
    )
}

/**
 * Суточная статистика трафика и времени сессий — как stats.json
 * в desktop-клиенте. Храним в отдельном SharedPreferences.
 */
class StatsStore(context: Context) {

    private val sp = context.applicationContext
        .getSharedPreferences("dogma_stats", Context.MODE_PRIVATE)
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    fun load(): StatsData = runCatching {
        sp.getString(KEY_DATA, null)
            ?.let { json.decodeFromString<StatsData>(it) }
            ?: StatsData()
    }.getOrDefault(StatsData())

    @Synchronized
    fun addTraffic(up: Long, down: Long, seconds: Double, serverName: String?) {
        val data = load()
        val key = dayKey()
        val day = data.days[key] ?: DayStats()
        val next = data.copy(
            days = data.days + (key to DayStats(
                up = day.up + up.coerceAtLeast(0),
                down = day.down + down.coerceAtLeast(0),
                seconds = day.seconds + seconds.toLong().coerceAtLeast(0),
            )),
            lastServerName = serverName ?: data.lastServerName,
        )
        val trimmed = if (next.days.size > 400) {
            next.copy(days = next.days.toList().sortedBy { it.first }.takeLast(400).toMap())
        } else {
            next
        }
        sp.edit().putString(KEY_DATA, json.encodeToString(trimmed)).apply()
    }

    fun summary(range: StatsRange): StatsSummary = load().summary(range)

    private companion object {
        const val KEY_DATA = "stats_json"
    }
}

private fun rangeStart(range: StatsRange): Long {
    val now = Calendar.getInstance()
    return when (range) {
        StatsRange.TODAY -> dayStart(dayKey())?.timeInMillis ?: now.timeInMillis
        StatsRange.WEEK -> {
            now.add(Calendar.DAY_OF_MONTH, -6)
            startOfDay(now)
        }
        StatsRange.MONTH -> {
            now.add(Calendar.MONTH, -1)
            startOfDay(now)
        }
        StatsRange.YEAR -> {
            now.add(Calendar.YEAR, -1)
            startOfDay(now)
        }
    }
}

private fun startOfDay(cal: Calendar): Long {
    cal.set(Calendar.HOUR_OF_DAY, 0)
    cal.set(Calendar.MINUTE, 0)
    cal.set(Calendar.SECOND, 0)
    cal.set(Calendar.MILLISECOND, 0)
    return cal.timeInMillis
}

private fun dayStart(key: String): Calendar? = runCatching {
    val parts = key.split('-')
    Calendar.getInstance().apply {
        set(Calendar.YEAR, parts[0].toInt())
        set(Calendar.MONTH, parts[1].toInt() - 1)
        set(Calendar.DAY_OF_MONTH, parts[2].toInt())
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }
}.getOrNull()

private fun dayKey(ts: Long = System.currentTimeMillis()): String {
    val c = Calendar.getInstance().apply { timeInMillis = ts }
    return String.format(
        Locale.US,
        "%04d-%02d-%02d",
        c.get(Calendar.YEAR),
        c.get(Calendar.MONTH) + 1,
        c.get(Calendar.DAY_OF_MONTH),
    )
}
