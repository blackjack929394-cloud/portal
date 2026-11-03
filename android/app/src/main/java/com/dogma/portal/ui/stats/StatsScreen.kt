package com.dogma.portal.ui.stats

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dogma.portal.AppState
import com.dogma.portal.stats.StatsRange
import com.dogma.portal.stats.summary
import com.dogma.portal.ui.Strings
import com.dogma.portal.ui.components.DogmaIcon
import com.dogma.portal.ui.components.DogmaIconKind
import com.dogma.portal.ui.components.PageTitle
import com.dogma.portal.ui.components.RangeTabs
import com.dogma.portal.ui.components.SpeedChart
import com.dogma.portal.ui.components.StatCard
import com.dogma.portal.ui.theme.dogmaPalette
import com.dogma.portal.util.formatBytes
import com.dogma.portal.util.formatDuration
import com.dogma.portal.vpn.VpnState
import com.dogma.portal.vpn.VpnStatus
import kotlinx.coroutines.delay
import kotlin.math.min

@Composable
fun StatsScreen(
    state: AppState,
    vpn: VpnStatus,
    t: Strings,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = dogmaPalette()
    var rangeKey by rememberSaveable { mutableStateOf("today") }
    val range = when (rangeKey) {
        "week" -> StatsRange.WEEK
        "month" -> StatsRange.MONTH
        "year" -> StatsRange.YEAR
        else -> StatsRange.TODAY
    }
    val summary = remember(state.stats, rangeKey) { state.stats.summary(range) }

    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(vpn.state, vpn.connectedSince) {
        while (vpn.state == VpnState.CONNECTED) {
            now = System.currentTimeMillis()
            delay(1_000)
        }
    }
    LaunchedEffect(Unit) {
        while (true) {
            onRefresh()
            delay(5_000)
        }
    }

    val connectionSeconds = if (vpn.state == VpnState.CONNECTED && vpn.connectedSince > 0) {
        (now - vpn.connectedSince) / 1000
    } else {
        summary.seconds
    }
    val lastServer = summary.lastServerName ?: vpn.node?.name ?: "—"

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(start = 22.dp, end = 22.dp, top = 14.dp, bottom = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(Modifier.fillMaxWidth().widthIn(max = 640.dp)) {
            PageTitle(t["statsTitle"])
            Spacer(Modifier.height(14.dp))
            RangeTabs(selected = rangeKey, t = t, onSelect = { rangeKey = it })
            Spacer(Modifier.height(14.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatCard(
                    label = t["uploaded"],
                    value = formatBytes(summary.up, t),
                    modifier = Modifier.weight(1f),
                )
                StatCard(
                    label = t["downloaded"],
                    value = formatBytes(summary.down, t),
                    modifier = Modifier.weight(1f),
                )
            }

            Spacer(Modifier.height(14.dp))
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(p.card, RoundedCornerShape(14.dp))
                    .border(1.dp, p.border, RoundedCornerShape(14.dp))
                    .padding(horizontal = 16.dp, vertical = 14.dp),
            ) {
                Spacer(Modifier.height(10.dp))
                Text(
                    t["speedTitle"],
                    color = p.fg,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                Spacer(Modifier.height(10.dp))
                SpeedChart(
                    points = state.speedHistory,
                    emptyText = if (vpn.state == VpnState.CONNECTED) "" else t["noActiveConnection"],
                    collectingText = if (vpn.state == VpnState.CONNECTED) t["collectingData"] else "",
                )
            }

            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatCard(
                    label = t["connectionTimeLabel"],
                    value = formatDuration(connectionSeconds, t),
                    modifier = Modifier.weight(1f),
                )
                StatCard(
                    label = t["lastServer"],
                    value = lastServer,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}
