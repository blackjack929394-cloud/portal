package com.dogma.portal.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
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
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dogma.portal.AppState
import com.dogma.portal.ui.Strings
import com.dogma.portal.ui.components.AppMark
import com.dogma.portal.ui.components.DogmaIcon
import com.dogma.portal.ui.components.DogmaIconKind
import com.dogma.portal.ui.components.FlagCircle
import com.dogma.portal.ui.components.OutlineButton
import com.dogma.portal.ui.components.PrimaryButton
import com.dogma.portal.ui.components.VpnRing
import com.dogma.portal.ui.theme.Mono
import com.dogma.portal.ui.theme.dogmaPalette
import com.dogma.portal.util.formatClock
import com.dogma.portal.vpn.VpnState
import com.dogma.portal.vpn.VpnStatus
import kotlinx.coroutines.delay

@Composable
fun HomeScreen(
    state: AppState,
    vpn: VpnStatus,
    t: Strings,
    onConnect: () -> Unit,
    onDisconnect: () -> Unit,
    onOpenServers: () -> Unit,
    onRequestAccess: () -> Unit,
    onOpenChat: () -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = dogmaPalette()
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(vpn.state, vpn.connectedSince) {
        while (vpn.state == VpnState.CONNECTED) {
            now = System.currentTimeMillis()
            delay(1_000)
        }
    }

    val canToggle = vpn.state == VpnState.CONNECTED ||
        vpn.state == VpnState.CONNECTING ||
        state.canConnect
    val toggle: () -> Unit = {
        when (vpn.state) {
            VpnState.CONNECTED, VpnState.CONNECTING -> onDisconnect()
            VpnState.ERROR, VpnState.DISCONNECTED -> onConnect()
        }
    }
    val ringLabel = when (vpn.state) {
        VpnState.CONNECTED -> t["disconnect"]
        VpnState.CONNECTING -> t["cancelConnection"]
        VpnState.ERROR -> t["retry"]
        VpnState.DISCONNECTED -> t["connect"]
    }

    BoxWithConstraints(modifier.fillMaxSize()) {
        val minHeight = maxHeight
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .heightIn(min = minHeight)
                .padding(horizontal = 22.dp, vertical = 14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Column(
                modifier = Modifier.fillMaxWidth().widthIn(max = 560.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                VpnRing(
                    state = vpn.state,
                    enabled = canToggle,
                    contentDescription = ringLabel,
                    onClick = toggle,
                ) {
                    when (vpn.state) {
                        VpnState.ERROR -> DogmaIcon(
                            DogmaIconKind.WARN,
                            Modifier.size(84.dp),
                            tint = p.danger,
                            strokeWidth = 2.4.dp,
                        )
                        else -> AppMark(
                            size = 112.dp,
                            tint = if (vpn.state == VpnState.DISCONNECTED) p.muted else p.fg,
                        )
                    }
                }

                Spacer(Modifier.height(22.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = when (vpn.state) {
                            VpnState.CONNECTED -> t["homeConnected"]
                            VpnState.CONNECTING -> t["homeConnecting"]
                            VpnState.ERROR -> t["homeError"]
                            VpnState.DISCONNECTED -> t["homeDisconnected"]
                        },
                        color = p.fg,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Medium,
                        textAlign = TextAlign.Center,
                    )
                    if (vpn.state == VpnState.CONNECTED) {
                        Spacer(Modifier.size(8.dp))
                        Box(Modifier.size(6.dp).background(p.ok, CircleShape))
                    }
                }
                Spacer(Modifier.height(5.dp))
                Text(
                    text = when (vpn.state) {
                        VpnState.CONNECTED -> t["homeConnectedSub"]
                        VpnState.CONNECTING -> vpn.node?.name ?: t["homePreparing"]
                        VpnState.ERROR -> vpn.error ?: t["homeErrorSub"]
                        VpnState.DISCONNECTED -> t["homeDisconnectedSub"]
                    },
                    color = p.muted,
                    fontSize = 13.sp,
                    textAlign = TextAlign.Center,
                )

                if (vpn.state == VpnState.CONNECTED) {
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                        state.externalIp?.let { ip ->
                            Text(
                                text = "IP $ip",
                                color = p.muted,
                                fontSize = 12.sp,
                                fontFamily = Mono,
                            )
                        }
                        Text(
                            text = formatClock((now - vpn.connectedSince) / 1000),
                            color = p.muted,
                            fontSize = 12.sp,
                            fontFamily = Mono,
                        )
                    }
                }

                if (!state.hasToken) {
                    Spacer(Modifier.height(18.dp))
                    GateCard(
                        state = state,
                        t = t,
                        onRequestAccess = onRequestAccess,
                        onOpenChat = onOpenChat,
                        onRefresh = onRefresh,
                    )
                } else if (state.nodes.isEmpty() && !state.nodesLoading) {
                    Spacer(Modifier.height(18.dp))
                    GateCard(
                        state = state,
                        t = t,
                        onRequestAccess = onRequestAccess,
                        onOpenChat = onOpenChat,
                        onRefresh = onRefresh,
                    )
                } else if (state.nodesLoading) {
                    Spacer(Modifier.height(18.dp))
                    Text(t["authLoading"], color = p.muted, fontSize = 13.sp)
                }

                if (state.selected != null) {
                    val selected = state.selected
                    Spacer(Modifier.height(18.dp))
                    ServerPill(
                        name = selected.name,
                        host = selected.hostPort,
                        ping = state.pings[selected.host],
                        pingPending = !state.pings.containsKey(selected.host),
                        onClick = onOpenServers,
                    )
                }
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}

@Composable
private fun GateCard(
    state: AppState,
    t: Strings,
    onRequestAccess: () -> Unit,
    onOpenChat: () -> Unit,
    onRefresh: () -> Unit,
) {
    val p = dogmaPalette()
    val status = state.subStatus
    val title: String
    val subtitle: String
    when {
        state.subLoading -> {
            title = t["authLoading"]
            subtitle = ""
        }
        state.hasToken && state.nodes.isEmpty() -> {
            title = t["noServersTitle"]
            subtitle = t["noServersSub"]
        }
        status == "pending" -> {
            title = t["gatePendingTitle"]
            subtitle = t["gatePendingSub"]
        }
        status == "denied" -> {
            title = t["gateDeniedTitle"]
            subtitle = t["gateDeniedSub"]
        }
        else -> {
            title = t["gateNoneTitle"]
            subtitle = state.subError ?: t["gateNoneSub"]
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(p.card, RoundedCornerShape(14.dp))
            .border(1.dp, p.border, RoundedCornerShape(14.dp))
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, color = p.fg, fontSize = 15.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center)
        if (subtitle.isNotBlank()) {
            Spacer(Modifier.height(6.dp))
            Text(subtitle, color = p.muted, fontSize = 13.sp, textAlign = TextAlign.Center)
        }
        if (!state.subLoading) {
            Spacer(Modifier.height(12.dp))
            when {
                state.hasToken && state.nodes.isEmpty() -> OutlineButton(
                    text = t["refresh"],
                    onClick = onRefresh,
                    fillWidth = false,
                )
                status == "denied" -> OutlineButton(
                    text = t["gateSupport"],
                    onClick = onOpenChat,
                    fillWidth = false,
                )
                status == "pending" -> Unit
                else -> PrimaryButton(
                    text = if (state.requestBusy) t["requestBusy"] else t["requestAccess"],
                    onClick = onRequestAccess,
                    enabled = !state.requestBusy,
                    fillWidth = false,
                )
            }
        }
    }
}

@Composable
private fun ServerPill(
    name: String,
    host: String,
    ping: Int?,
    pingPending: Boolean,
    onClick: () -> Unit,
) {
    val p = dogmaPalette()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(p.card, RoundedCornerShape(10.dp))
            .border(1.dp, p.border, RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FlagCircle(name)
        Spacer(Modifier.size(11.dp))
        Column(Modifier.weight(1f)) {
            Text(
                name,
                color = p.fg,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                host,
                color = p.muted,
                fontSize = 11.5.sp,
                fontFamily = Mono,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            text = when {
                pingPending -> "…"
                ping != null -> "$ping ms"
                else -> ""
            },
            color = p.muted,
            fontSize = 12.sp,
            fontFamily = Mono,
        )
        Spacer(Modifier.size(8.dp))
        DogmaIcon(DogmaIconKind.CHEVRON, Modifier.size(15.dp), tint = p.muted)
    }
}
