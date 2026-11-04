package com.dogma.portal.ui.routing

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dogma.portal.RoutingUi
import com.dogma.portal.data.RoutingProfile
import com.dogma.portal.ui.Strings
import com.dogma.portal.ui.components.DogmaIcon
import com.dogma.portal.ui.components.DogmaIconKind
import com.dogma.portal.ui.components.DogmaSwitch
import com.dogma.portal.ui.components.DogmaTextField
import com.dogma.portal.ui.components.MiniButton
import com.dogma.portal.ui.components.OutlineButton
import com.dogma.portal.ui.components.PrimaryButton
import com.dogma.portal.ui.theme.dogmaPalette

@Composable
fun RoutingScreen(
    state: RoutingUi,
    t: Strings,
    onBack: () -> Unit,
    onSave: (RoutingProfile) -> Unit,
) {
    val p = dogmaPalette()
    var mode by rememberSaveable { mutableStateOf("global") }
    var ruDirect by rememberSaveable { mutableStateOf(true) }
    var presets by rememberSaveable { mutableStateOf(listOf<String>()) }
    var proxy by rememberSaveable { mutableStateOf(listOf<String>()) }
    var direct by rememberSaveable { mutableStateOf(listOf<String>()) }
    var proxyInput by rememberSaveable { mutableStateOf("") }
    var directInput by rememberSaveable { mutableStateOf("") }
    var domainsError by rememberSaveable { mutableStateOf<String?>(null) }

    LaunchedEffect(state.profile) {
        mode = state.profile.mode
        ruDirect = state.profile.ruDirect
        presets = state.profile.presets
        proxy = state.profile.proxyDomains
        direct = state.profile.directDomains
    }

    fun addDomain(raw: String, toProxy: Boolean) {
        val d = normalizeDomain(raw)
        if (d == null) {
            domainsError = t["routingInvalidDomain"] + raw.trim()
            return
        }
        domainsError = null
        if (toProxy) {
            if (!proxy.contains(d)) proxy = proxy + d
            proxyInput = ""
        } else {
            if (!direct.contains(d)) direct = direct + d
            directInput = ""
        }
    }

    Box(Modifier.fillMaxSize().background(p.bg)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 20.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) content@{
            Column(Modifier.fillMaxWidth().widthIn(max = 640.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .background(p.card, RoundedCornerShape(10.dp))
                            .border(1.dp, p.border, RoundedCornerShape(10.dp))
                            .clickable(onClick = onBack),
                        contentAlignment = Alignment.Center,
                    ) {
                        DogmaIcon(DogmaIconKind.CHEVRON, Modifier.size(16.dp), tint = p.muted)
                    }
                    Spacer(Modifier.size(12.dp))
                    Column {
                        Text(t["routingTitle"], color = p.fg, fontSize = 20.sp, fontWeight = FontWeight.Medium)
                        Text(t["routingSyncHint"], color = p.muted, fontSize = 12.sp)
                    }
                }

                if (state.loading) {
                    Spacer(Modifier.height(40.dp))
                    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(
                            color = p.warning,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(28.dp),
                        )
                        Spacer(Modifier.height(12.dp))
                        Text(t["authLoading"], color = p.muted, fontSize = 13.sp)
                    }
                    return@content
                }

                Spacer(Modifier.height(24.dp))
                Text(t["routingModeTitle"], color = p.muted, fontSize = 12.sp)
                Spacer(Modifier.height(8.dp))
                ModeOption(
                    title = t["routingModeGlobal"],
                    hint = t["routingModeGlobalHint"],
                    selected = mode == "global",
                    onClick = { mode = "global" },
                )
                Spacer(Modifier.height(8.dp))
                ModeOption(
                    title = t["routingModeSelective"],
                    hint = t["routingModeSelectiveHint"],
                    selected = mode == "selective",
                    onClick = { mode = "selective" },
                )

                if (mode == "global") {
                    Spacer(Modifier.height(16.dp))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(p.card, RoundedCornerShape(12.dp))
                            .border(1.dp, p.border, RoundedCornerShape(12.dp))
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(t["routingRuDirect"], color = p.fg, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                            Spacer(Modifier.height(2.dp))
                            Text(t["routingRuDirectHint"], color = p.muted, fontSize = 12.sp, lineHeight = 17.sp)
                        }
                        Spacer(Modifier.size(12.dp))
                        DogmaSwitch(checked = ruDirect, onCheckedChange = { ruDirect = it })
                    }

                    Spacer(Modifier.height(20.dp))
                    DomainEditor(
                        title = t["routingDirectDomains"],
                        hint = t["routingDirectDomainsHint"],
                        value = directInput,
                        onValueChange = { directInput = it },
                        domains = direct,
                        addLabel = t["routingAdd"],
                        placeholder = t["routingDomainsPh"],
                        onAdd = { addDomain(directInput, toProxy = false) },
                        onRemove = { direct = direct - it },
                    )
                } else {
                    Spacer(Modifier.height(20.dp))
                    Text(t["routingPresetsLabel"], color = p.muted, fontSize = 12.sp)
                    Spacer(Modifier.height(8.dp))
                    state.presets.forEach { preset ->
                        val checked = presets.contains(preset.id)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(bottom = 6.dp)
                                .background(p.card, RoundedCornerShape(10.dp))
                                .border(
                                    1.dp,
                                    if (checked) p.warning.copy(alpha = 0.55f) else p.border,
                                    RoundedCornerShape(10.dp),
                                )
                                .clickable {
                                    presets = if (checked) presets - preset.id else presets + preset.id
                                }
                                .padding(horizontal = 14.dp, vertical = 11.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(18.dp)
                                    .background(
                                        if (checked) p.warning else p.bg,
                                        RoundedCornerShape(5.dp),
                                    )
                                    .border(
                                        1.dp,
                                        if (checked) p.warning else p.border,
                                        RoundedCornerShape(5.dp),
                                    ),
                                contentAlignment = Alignment.Center,
                            ) {
                                if (checked) {
                                    DogmaIcon(DogmaIconKind.CHECK, Modifier.size(12.dp), tint = p.accentFg, strokeWidth = 2.2.dp)
                                }
                            }
                            Spacer(Modifier.size(12.dp))
                            Text(preset.label, color = p.fg, fontSize = 14.sp)
                        }
                    }

                    Spacer(Modifier.height(14.dp))
                    DomainEditor(
                        title = t["routingProxyDomains"],
                        hint = t["routingProxyDomainsHint"],
                        value = proxyInput,
                        onValueChange = { proxyInput = it },
                        domains = proxy,
                        addLabel = t["routingAdd"],
                        placeholder = t["routingDomainsPh"],
                        onAdd = { addDomain(proxyInput, toProxy = true) },
                        onRemove = { proxy = proxy - it },
                    )
                }

                if (domainsError != null) {
                    Spacer(Modifier.height(10.dp))
                    Text(domainsError ?: "", color = p.danger, fontSize = 12.5.sp)
                }

                Spacer(Modifier.height(20.dp))
                Text(t["routingLocalNote"], color = p.muted, fontSize = 12.sp, lineHeight = 17.sp)
                Spacer(Modifier.height(6.dp))
                Text(t["routingDnsNote"], color = p.muted, fontSize = 12.sp, lineHeight = 17.sp)

                if (state.error != null) {
                    Spacer(Modifier.height(14.dp))
                    Text(state.error, color = p.danger, fontSize = 12.5.sp)
                }
                if (state.saved) {
                    Spacer(Modifier.height(14.dp))
                    Text(t["routingSaved"], color = p.ok, fontSize = 12.5.sp)
                }

                Spacer(Modifier.height(24.dp))
                PrimaryButton(
                    text = if (state.saving) t["routingSaving"] else t["routingSave"],
                    enabled = !state.saving,
                    onClick = {
                        onSave(
                            RoutingProfile(
                                mode = mode,
                                ruDirect = ruDirect,
                                presets = presets,
                                proxyDomains = proxy,
                                directDomains = direct,
                            ),
                        )
                    },
                )
                Spacer(Modifier.height(8.dp))
                OutlineButton(t["close"], onClick = onBack)
                Spacer(Modifier.height(24.dp))
            }
        }
    }
}

@Composable
private fun ModeOption(
    title: String,
    hint: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val p = dogmaPalette()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(p.card, RoundedCornerShape(12.dp))
            .border(
                1.dp,
                if (selected) p.warning.copy(alpha = 0.6f) else p.border,
                RoundedCornerShape(12.dp),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(18.dp)
                .background(if (selected) p.warning else p.bg, CircleShape)
                .border(1.dp, if (selected) p.warning else p.border, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (selected) Box(Modifier.size(6.dp).background(p.accentFg, CircleShape))
        }
        Spacer(Modifier.size(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = p.fg, fontSize = 14.sp, fontWeight = FontWeight.Medium)
            Spacer(Modifier.height(3.dp))
            Text(hint, color = p.muted, fontSize = 12.sp, lineHeight = 17.sp)
        }
    }
}

@Composable
private fun DomainEditor(
    title: String,
    hint: String,
    value: String,
    onValueChange: (String) -> Unit,
    domains: List<String>,
    addLabel: String,
    placeholder: String,
    onAdd: () -> Unit,
    onRemove: (String) -> Unit,
) {
    val p = dogmaPalette()
    Text(title, color = p.muted, fontSize = 12.sp)
    Spacer(Modifier.height(4.dp))
    Text(hint, color = p.muted, fontSize = 12.sp, lineHeight = 17.sp)
    Spacer(Modifier.height(10.dp))
    Row(verticalAlignment = Alignment.Bottom) {
        DogmaTextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = placeholder,
            modifier = Modifier.weight(1f),
        )
        Spacer(Modifier.size(8.dp))
        MiniButton(text = addLabel, onClick = onAdd, enabled = value.isNotBlank())
    }
    if (domains.isNotEmpty()) {
        Spacer(Modifier.height(12.dp))
        Column(verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(6.dp)) {
            domains.forEach { domain ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(p.bg, RoundedCornerShape(8.dp))
                        .border(1.dp, p.border, RoundedCornerShape(8.dp))
                        .padding(start = 12.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        domain,
                        color = p.fg,
                        fontSize = 13.sp,
                        modifier = Modifier.weight(1f),
                    )
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clickable { onRemove(domain) },
                        contentAlignment = Alignment.Center,
                    ) {
                        DogmaIcon(
                            DogmaIconKind.CLOSE,
                            Modifier.size(13.dp),
                            tint = p.muted,
                        )
                    }
                }
            }
        }
    }
}

/** Нормализует домен так же, как сервер: без схемы, пути, порта и wildcard. */
private fun normalizeDomain(raw: String): String? {
    var s = raw.trim().lowercase()
    if (s.isBlank()) return null
    s = s.replace(Regex("^[a-z][a-z0-9+.-]*://"), "")
    s = s.split('/', '?', '#').firstOrNull().orEmpty()
    s = s.replace(Regex(":\\d+$"), "")
    s = s.removePrefix("*.").trim('.')
    if (s.isBlank() || s.length > 253) return null
    if (!Regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$").matches(s)) return null
    return s
}
