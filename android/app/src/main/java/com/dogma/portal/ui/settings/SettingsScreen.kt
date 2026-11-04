package com.dogma.portal.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dogma.portal.AppState
import com.dogma.portal.ui.Strings
import com.dogma.portal.ui.components.DogmaSwitch
import com.dogma.portal.ui.components.PageTitle
import com.dogma.portal.ui.components.SettingRow
import com.dogma.portal.ui.theme.dogmaPalette

@Composable
fun SettingsScreen(
    state: AppState,
    t: Strings,
    onKillSwitch: (Boolean) -> Unit,
    onAutostart: (Boolean) -> Unit,
    onOpenRouting: () -> Unit,
    onOpenServer: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = dogmaPalette()
    val settings = state.settings

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(start = 22.dp, end = 22.dp, top = 14.dp, bottom = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(Modifier.fillMaxWidth().widthIn(max = 640.dp)) {
            PageTitle(t["settingsTitle"])
            Spacer(Modifier.height(16.dp))

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SettingRow(
                    title = t["killSwitch"],
                    subtitle = t["killSwitchHint"],
                    trailing = {
                        DogmaSwitch(checked = settings.killSwitch, onCheckedChange = onKillSwitch)
                    },
                )
                SettingRow(
                    title = t["autostart"],
                    subtitle = t["autostartHint"],
                    trailing = {
                        DogmaSwitch(checked = settings.autostart, onCheckedChange = onAutostart)
                    },
                )
                SettingRow(
                    title = t["routingTitle"],
                    subtitle = t["routingInAppHint"],
                    onClick = onOpenRouting,
                    showChevron = true,
                )
                SettingRow(
                    title = t["portalServer"],
                    subtitle = t["portalServerHint"],
                    onClick = onOpenServer,
                    showChevron = true,
                )
            }

            Spacer(Modifier.height(16.dp))
            Text(
                text = t["versionLabel"],
                color = p.muted,
                fontSize = 11.sp,
            )
        }
    }
}
