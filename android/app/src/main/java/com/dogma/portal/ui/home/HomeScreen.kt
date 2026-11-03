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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dogma.portal.AppState
import com.dogma.portal.ui.Strings
import com.dogma.portal.ui.components.ConnectingDots
import com.dogma.portal.ui.components.DogmaIcon
import com.dogma.portal.ui.components.DogmaIconKind
import com.dogma.portal.ui.components.DogmaLogo
import com.dogma.portal.ui.components.FlagCircle
import com.dogma.portal.ui.components.OutlineButton
import com.dogma.portal.ui.components.PrimaryButton
import com.dogma.portal.ui.components.VpnRing
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
                VpnRing(state = vpn.state) {
                    when (vpn.state) {
                        VpnState.ERROR -> DogmaIcon(
                            DogmaIconKind.WARN,
                            Modifier.size(84.dp),
                            tint = p.danger,
                            strokeWidth = 2.4.dp,
                        )
                        else -> DogmaLogo(
                            size = 108.dp,
                            circleColor = p.card,
                            markColor = when (vpn.state) {
                                VpnState.DISCONNECTED -> p.danger
                                else -> p.fg
                            },
                        )
                    }
                }

                Spacer(Modifier.height(20.dp))
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
                        fontWeight = FontWeight.SemiBold,
                        textAlign = TextAlign.Center,
                    )
                    if (vpn.state == VpnState.CONNECTED) {
                        Spacer(Modifier.size(8.dp))
                        Box(
                            modifier = Modifier.size(20.dp).background(p.fg, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            DogmaIcon(DogmaIconKind.CHECK, Modifier.size(12.dp), tint = p.bg, strokeWidth = 2.2.dp)
                        }
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

                if (vpn.state == VpnState.CONNECTING) {
                    Spacer(Modifier.height(14.dp))
                    ConnectingDots()
                }

                if (vpn.state == VpnState.CONNECTED) {
                    Spacer(Modifier.height(18.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        InfoChip(
                            icon = DogmaIconKind.GLOBE,
                            label = t["ipAddress"],
                            value = state.externalIp ?: "…",
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            InfoChip(
                                icon = DogmaIconKind.SHIELD,
                                label = t["protocol"],
                                value = t["protocolValue"],
                                modifier = Modifier.weight(1f),
                            )
                            InfoChip(
                                icon = DogmaIconKind.CLOCK,
                                label = t["connectionTime"],
                                value = formatClock((now - vpn.connectedSince) / 1000),
                                modifier = Modifier.weight(1f),
                            )
                        }
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

                if (state.canConnect) {
                    Spacer(Modifier.height(16.dp))
                    when (vpn.state) {
                        VpnState.CONNECTED -> OutlineButton(
                            text = t["disconnect"],
                            onClick = onDisconnect,
                            icon = DogmaIconKind.POWER,
                        )
                        VpnState.CONNECTING -> OutlineButton(
                            text = t["cancelConnection"],
                            onClick = onDisconnect,
                        )
                        VpnState.ERROR -> PrimaryButton(
                            text = t["retry"],
                            onClick = onConnect,
                            icon = DogmaIconKind.POWER,
                        )
                        VpnState.DISCONNECTED -> PrimaryButton(
                            text = t["connect"],
                            onClick = onConnect,
                            icon = DogmaIconKind.POWER,
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
            }
        }
    }
}

@Composable
private fun InfoChip(
    icon: DogmaIconKind,
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    val p = dogmaPalette()
    Row(
        modifier = modifier
            .background(p.card, RoundedCornerShape(13.dp))
            .border(1.dp, p.border, RoundedCornerShape(13.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DogmaIcon(icon, Modifier.size(17.dp), tint = p.muted)
        Spacer(Modifier.size(9.dp))
        Column {
            Text(label, color = p.muted, fontSize = 10.5.sp, maxLines = 1)
            Spacer(Modifier.height(2.dp))
            Text(
                value,
                color = p.fg,
                fontSize = 12.5.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
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
            subtitle = t["serversLoading"]
        }
        state.hasToken && state.nodes.isEmpty() -> {
            title = t["noServersTitle"]
            subtitle = state.nodesError ?: t["noServersSub"]
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
            .background(p.card, RoundedCornerShape(16.dp))
            .border(1.dp, p.border, RoundedCornerShape(16.dp))
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(title, color = p.fg, fontSize = 14.5.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center)
        Spacer(Modifier.height(6.dp))
        Text(subtitle, color = p.muted, fontSize = 12.5.sp, textAlign = TextAlign.Center)
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
    val pillBg = if (p.bg.luminance() < 0.2f) Color(0xFF262626) else Color(0xFF111111)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(pillBg, RoundedCornerShape(15.dp))
            .clip(RoundedCornerShape(15.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FlagCircle(name)
        Spacer(Modifier.size(11.dp))
        Column(Modifier.weight(1f)) {
            Text(name, color = Color.White, fontSize = 13.5.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
            Spacer(Modifier.height(2.dp))
            Text(host, color = Color(0xFF9A9A9A), fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            DogmaIcon(DogmaIconKind.SIGNAL, Modifier.size(13.dp), tint = Color(0xFFCFCFCF))
            Spacer(Modifier.size(5.dp))
            Text(
                text = when {
                    pingPending -> "…"
                    ping != null -> "$ping ms"
                    else -> "—"
                },
                color = Color(0xFFCFCFCF),
                fontSize = 12.sp,
            )
        }
        Spacer(Modifier.size(8.dp))
        DogmaIcon(DogmaIconKind.CHEVRON, Modifier.size(15.dp), tint = Color(0xFF9A9A9A))
    }
}
