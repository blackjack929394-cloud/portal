package com.dogma.portal.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dogma.portal.AppState
import com.dogma.portal.data.ProxyNode
import com.dogma.portal.ui.chat.ChatScreen
import com.dogma.portal.ui.components.BrandBlock
import com.dogma.portal.ui.components.ChatBadge
import com.dogma.portal.ui.components.DogmaIcon
import com.dogma.portal.ui.components.DogmaIconKind
import com.dogma.portal.ui.home.HomeScreen
import com.dogma.portal.ui.profile.ProfileScreen
import com.dogma.portal.ui.servers.ServersScreen
import com.dogma.portal.ui.settings.SettingsScreen
import com.dogma.portal.ui.stats.StatsScreen
import com.dogma.portal.ui.theme.dogmaPalette
import com.dogma.portal.vpn.VpnStatus

enum class Tab { HOME, SERVERS, SETTINGS, STATS, PROFILE }

@Composable
fun MainScreen(
    state: AppState,
    vpn: VpnStatus,
    t: Strings,
    tab: Tab,
    onTab: (Tab) -> Unit,
    onConnect: () -> Unit,
    onDisconnect: () -> Unit,
    onOpenChat: () -> Unit,
    onRequestAccess: () -> Unit,
    onSelectNode: (ProxyNode) -> Unit,
    onToggleFavorite: (String) -> Unit,
    onRefreshSubscription: () -> Unit,
    onPing: () -> Unit,
    onKillSwitch: (Boolean) -> Unit,
    onAutostart: (Boolean) -> Unit,
    onLeakProtection: (Boolean) -> Unit,
    onDns: (String) -> Unit,
    onSplitTunneling: (String) -> Unit,
    onCycleTheme: () -> Unit,
    onLanguage: (Lang) -> Unit,
    onOpenServer: () -> Unit,
    onLogout: () -> Unit,
    onRefreshStats: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = dogmaPalette()
    BoxWithConstraints(modifier.fillMaxSize().background(p.bg)) {
        val wide = maxWidth >= 760.dp
        Row(Modifier.fillMaxSize()) {
            if (wide) {
                Sidebar(
                    tab = tab,
                    t = t,
                    unread = state.chat.unread,
                    onTab = onTab,
                    onCycleTheme = onCycleTheme,
                    onSettings = { onTab(Tab.SETTINGS) },
                )
            }
            Column(Modifier.weight(1f).fillMaxHeight()) {
                Box(Modifier.weight(1f).fillMaxWidth()) {
                    when (tab) {
                        Tab.HOME -> HomeScreen(
                            state = state,
                            vpn = vpn,
                            t = t,
                            onConnect = onConnect,
                            onDisconnect = onDisconnect,
                            onOpenServers = { onTab(Tab.SERVERS) },
                            onRequestAccess = onRequestAccess,
                            onOpenChat = onOpenChat,
                            onRefresh = onRefreshSubscription,
                        )
                        Tab.SERVERS -> ServersScreen(
                            state = state,
                            t = t,
                            onSelectNode = onSelectNode,
                            onToggleFavorite = onToggleFavorite,
                            onRefresh = onRefreshSubscription,
                            onPing = onPing,
                        )
                        Tab.SETTINGS -> SettingsScreen(
                            state = state,
                            t = t,
                            onKillSwitch = onKillSwitch,
                            onAutostart = onAutostart,
                            onLeakProtection = onLeakProtection,
                            onDns = onDns,
                            onSplitTunneling = onSplitTunneling,
                            onCycleTheme = onCycleTheme,
                            onLanguage = onLanguage,
                            onOpenServer = onOpenServer,
                        )
                        Tab.STATS -> StatsScreen(
                            state = state,
                            vpn = vpn,
                            t = t,
                            onRefresh = onRefreshStats,
                        )
                        Tab.PROFILE -> ProfileScreen(
                            state = state,
                            t = t,
                            onOpenChat = onOpenChat,
                            onLogout = onLogout,
                        )
                    }
                }
                if (!wide) {
                    BottomNav(
                        tab = tab,
                        t = t,
                        unread = state.chat.unread,
                        onTab = onTab,
                    )
                }
            }
        }
    }
}

@Composable
private fun Sidebar(
    tab: Tab,
    t: Strings,
    unread: Int,
    onTab: (Tab) -> Unit,
    onCycleTheme: () -> Unit,
    onSettings: () -> Unit,
) {
    val p = dogmaPalette()
    Column(
        modifier = Modifier
            .width(208.dp)
            .fillMaxHeight()
            .background(p.sideBg)
            .padding(horizontal = 14.dp, vertical = 26.dp),
    ) {
        BrandBlock(logoSize = 64.dp, nameColor = Color.White, tagColor = Color(0xFF6F6F6F))
        Spacer(Modifier.height(28.dp))
        Tab.entries.forEach { item ->
            SidebarItem(
                tab = item,
                label = tabLabel(item, t),
                active = item == tab,
                unread = if (item == Tab.PROFILE) unread else 0,
                onClick = { onTab(item) },
            )
            Spacer(Modifier.height(4.dp))
        }
        Spacer(Modifier.weight(1f))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            SideIcon(DogmaIconKind.SUN, onCycleTheme)
            SideIcon(DogmaIconKind.GEAR, onSettings)
        }
    }
}

@Composable
private fun SidebarItem(
    tab: Tab,
    label: String,
    active: Boolean,
    unread: Int,
    onClick: () -> Unit,
) {
    val p = dogmaPalette()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(if (active) p.sideActiveBg else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(horizontal = 13.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DogmaIcon(
            tabIcon(tab),
            Modifier.size(17.dp),
            tint = if (active) p.sideActiveFg else p.sideFg,
        )
        Spacer(Modifier.width(11.dp))
        Text(
            label,
            color = if (active) p.sideActiveFg else p.sideFg,
            fontSize = 13.5.sp,
            modifier = Modifier.weight(1f),
        )
        if (unread > 0) ChatBadge(unread)
    }
}

@Composable
private fun SideIcon(icon: DogmaIconKind, onClick: () -> Unit) {
    val p = dogmaPalette()
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(RoundedCornerShape(9.dp))
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        DogmaIcon(icon, Modifier.size(17.dp), tint = p.sideFg)
    }
}

@Composable
private fun BottomNav(tab: Tab, t: Strings, unread: Int, onTab: (Tab) -> Unit) {
    val p = dogmaPalette()
    Column(Modifier.fillMaxWidth().background(p.sideBg)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFF1E1E1E)))
        Row(
            modifier = Modifier.fillMaxWidth().padding(vertical = 7.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
        ) {
            Tab.entries.forEach { item ->
                val active = item == tab
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(10.dp))
                        .clickable { onTab(item) }
                        .padding(vertical = 3.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(contentAlignment = Alignment.TopEnd) {
                        DogmaIcon(
                            tabIcon(item),
                            Modifier.size(20.dp),
                            tint = if (active) p.sideActiveFg else p.sideFg,
                        )
                        if (item == Tab.PROFILE && unread > 0) {
                            Box(Modifier.padding(start = 14.dp)) {
                                ChatBadge(unread)
                            }
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        tabLabel(item, t),
                        color = if (active) p.sideActiveFg else p.sideFg,
                        fontSize = 10.sp,
                        fontWeight = if (active) FontWeight.Medium else FontWeight.Normal,
                        maxLines = 1,
                    )
                }
            }
        }
    }
}

private fun tabIcon(tab: Tab): DogmaIconKind = when (tab) {
    Tab.HOME -> DogmaIconKind.HOME
    Tab.SERVERS -> DogmaIconKind.SERVERS
    Tab.SETTINGS -> DogmaIconKind.SETTINGS
    Tab.STATS -> DogmaIconKind.STATS
    Tab.PROFILE -> DogmaIconKind.PROFILE
}

private fun tabLabel(tab: Tab, t: Strings): String = when (tab) {
    Tab.HOME -> t["tabHome"]
    Tab.SERVERS -> t["tabServers"]
    Tab.SETTINGS -> t["tabSettings"]
    Tab.STATS -> t["tabStats"]
    Tab.PROFILE -> t["tabProfile"]
}
