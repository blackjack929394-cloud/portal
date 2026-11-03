package com.dogma.portal.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.dogma.portal.AppState
import com.dogma.portal.data.ThemeMode
import com.dogma.portal.ui.Lang
import com.dogma.portal.ui.Strings
import com.dogma.portal.ui.components.CardBox
import com.dogma.portal.ui.components.DogmaIconKind
import com.dogma.portal.ui.components.DogmaSwitch
import com.dogma.portal.ui.components.DogmaTextField
import com.dogma.portal.ui.components.MiniButton
import com.dogma.portal.ui.components.PageTitle
import com.dogma.portal.ui.components.SettingRow
import com.dogma.portal.ui.theme.dogmaPalette
import kotlinx.coroutines.delay

@Composable
fun SettingsScreen(
    state: AppState,
    t: Strings,
    onKillSwitch: (Boolean) -> Unit,
    onAutostart: (Boolean) -> Unit,
    onLeakProtection: (Boolean) -> Unit,
    onDns: (String) -> Unit,
    onSplitTunneling: (String) -> Unit,
    onCycleTheme: () -> Unit,
    onLanguage: (Lang) -> Unit,
    onOpenServer: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = dogmaPalette()
    val settings = state.settings
    var showDns by rememberSaveable { mutableStateOf(false) }
    var showLanguage by rememberSaveable { mutableStateOf(false) }
    var splitOpen by rememberSaveable { mutableStateOf(false) }
    var splitText by remember(settings.splitTunneling) { mutableStateOf(settings.splitTunneling) }
    var splitSaved by remember { mutableStateOf(false) }

    LaunchedEffect(splitSaved) {
        if (splitSaved) {
            delay(1800)
            splitSaved = false
        }
    }

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
                    title = t["dnsRow"],
                    subtitle = dnsLabel(settings.dns),
                    onClick = { showDns = true },
                    showChevron = true,
                )
                SettingRow(
                    title = t["leakProtection"],
                    subtitle = t["leakHint"],
                    trailing = {
                        DogmaSwitch(
                            checked = settings.leakProtection,
                            onCheckedChange = onLeakProtection,
                        )
                    },
                )
                SettingRow(
                    title = t["splitTunneling"],
                    subtitle = if (settings.splitTunneling.isBlank()) t["splitHint"] else settings.splitTunneling,
                    onClick = { splitOpen = !splitOpen },
                    showChevron = true,
                )
                if (splitOpen) {
                    CardBox(padding = 12.dp) {
                        DogmaTextField(
                            value = splitText,
                            onValueChange = { splitText = it },
                            placeholder = t["splitPlaceholder"],
                        )
                        Spacer(Modifier.height(8.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            if (splitSaved) {
                                Text(
                                    t["saved"],
                                    color = p.ok,
                                    fontSize = 12.5.sp,
                                    modifier = Modifier.padding(end = 10.dp),
                                )
                            }
                            MiniButton(
                                text = t["splitSave"],
                                onClick = {
                                    onSplitTunneling(splitText.trim())
                                    splitSaved = true
                                },
                            )
                        }
                    }
                }
                SettingRow(
                    title = t["language"],
                    subtitle = if (state.lang == Lang.RU) "Русский" else "English",
                    onClick = { showLanguage = true },
                    showChevron = true,
                )
                SettingRow(
                    title = t["themeRow"],
                    subtitle = when (settings.theme) {
                        ThemeMode.SYSTEM -> t["themeSystem"]
                        ThemeMode.DARK -> t["themeDark"]
                        ThemeMode.LIGHT -> t["themeLight"]
                    },
                    onClick = onCycleTheme,
                    showChevron = true,
                )
                SettingRow(
                    title = t["portalServer"],
                    subtitle = state.baseUrl,
                    onClick = onOpenServer,
                    showChevron = true,
                )
            }

            Spacer(Modifier.height(14.dp))
            Text(
                text = t["versionLabel"],
                color = p.muted,
                fontSize = 11.sp,
            )
        }
    }

    if (showDns) {
        ChoiceDialog(
            title = t["dnsRow"],
            options = listOf(
                "1.1.1.1" to "Cloudflare (1.1.1.1)",
                "8.8.8.8" to "Google (8.8.8.8)",
                "9.9.9.9" to "Quad9 (9.9.9.9)",
            ),
            selected = settings.dns,
            onDismiss = { showDns = false },
            onSelect = {
                onDns(it)
                showDns = false
            },
        )
    }

    if (showLanguage) {
        ChoiceDialog(
            title = t["language"],
            options = listOf("ru" to "Русский", "en" to "English"),
            selected = state.lang.code,
            onDismiss = { showLanguage = false },
            onSelect = {
                onLanguage(if (it == "en") Lang.EN else Lang.RU)
                showLanguage = false
            },
        )
    }
}

private fun dnsLabel(value: String): String = when (value) {
    "8.8.8.8" -> "Google (8.8.8.8)"
    "9.9.9.9" -> "Quad9 (9.9.9.9)"
    else -> "Cloudflare (1.1.1.1)"
}

@Composable
private fun ChoiceDialog(
    title: String,
    options: List<Pair<String, String>>,
    selected: String,
    onDismiss: () -> Unit,
    onSelect: (String) -> Unit,
) {
    val p = dogmaPalette()
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().padding(20.dp), contentAlignment = Alignment.Center) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 380.dp)
                    .background(p.card, RoundedCornerShape(16.dp))
                    .border(1.dp, p.border, RoundedCornerShape(16.dp))
                    .padding(18.dp),
            ) {
                Text(title, color = p.fg, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(10.dp))
                options.forEach { (value, label) ->
                    val on = value == selected
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .background(if (on) p.chipBg else p.card)
                            .clickable { onSelect(value) }
                            .padding(horizontal = 12.dp, vertical = 12.dp),
                    ) {
                        Text(
                            label,
                            color = p.fg,
                            fontSize = 14.sp,
                            fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal,
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                }
            }
        }
    }
}
