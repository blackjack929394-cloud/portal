package com.dogma.portal.ui.profile

import android.widget.Toast
import androidx.compose.foundation.background
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dogma.portal.AppState
import com.dogma.portal.ui.Strings
import com.dogma.portal.ui.components.ChatBadge
import com.dogma.portal.ui.components.DogmaIcon
import com.dogma.portal.ui.components.DogmaIconKind
import com.dogma.portal.ui.components.OutlineButton
import com.dogma.portal.ui.components.PageTitle
import com.dogma.portal.ui.components.SettingRow
import com.dogma.portal.ui.theme.dogmaPalette
import com.dogma.portal.util.formatDate

@Composable
fun ProfileScreen(
    state: AppState,
    t: Strings,
    onOpenChat: () -> Unit,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = dogmaPalette()
    val context = LocalContext.current
    val status = state.subStatus
    val soon = { Toast.makeText(context, t["comingSoon"], Toast.LENGTH_SHORT).show() }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(start = 22.dp, end = 22.dp, top = 14.dp, bottom = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(Modifier.fillMaxWidth().widthIn(max = 640.dp)) {
            PageTitle(t["profileTitle"])
            Spacer(Modifier.height(16.dp))

            Row(verticalAlignment = Alignment.CenterVertically) {
                val displayName = state.user?.name?.takeIf { it.isNotBlank() }
                    ?: state.user?.email?.takeIf { it.isNotBlank() }
                    ?: "—"
                val displayEmail = state.user?.email?.takeIf {
                    it.isNotBlank() && it != displayName
                }
                Box(
                    modifier = Modifier
                        .size(52.dp)
                        .background(p.chipBg, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    DogmaIcon(DogmaIconKind.PROFILE, Modifier.size(24.dp), tint = p.muted)
                }
                Spacer(Modifier.size(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        displayName,
                        color = p.fg,
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (displayEmail != null) {
                        Spacer(Modifier.height(2.dp))
                        Text(
                            displayEmail,
                            color = p.muted,
                            fontSize = 12.5.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                }
            }

            Spacer(Modifier.height(16.dp))
            val cardColor = when (status) {
                "active" -> if (p.bg.luminance() < 0.2f) Color(0xFF262626) else Color(0xFF111111)
                "denied" -> Color(0xFF5C2020)
                else -> Color(0xFF3A3A3A)
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(cardColor, RoundedCornerShape(15.dp))
                    .padding(horizontal = 18.dp, vertical = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        t["subscription"],
                        color = Color.White.copy(alpha = 0.55f),
                        fontSize = 10.5.sp,
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = when (status) {
                            "active" -> t["premium"]
                            "pending" -> t["planPending"]
                            "denied" -> t["planDenied"]
                            else -> t["planNone"]
                        },
                        color = Color.White,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        t["until"],
                        color = Color.White.copy(alpha = 0.55f),
                        fontSize = 10.5.sp,
                    )
                    Spacer(Modifier.height(3.dp))
                    Text(
                        if (status == "active") formatDate(state.subscription?.expiresAt) else "—",
                        color = Color.White,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
                Spacer(Modifier.size(10.dp))
                DogmaIcon(DogmaIconKind.STAR, Modifier.size(20.dp), tint = Color(0xFFFFD36E))
            }

            Spacer(Modifier.height(14.dp))
            SettingRow(
                icon = DogmaIconKind.DEVICES,
                title = t["devices"],
                subtitle = t["thisDevice"],
                trailing = {
                    Text(
                        t["deviceCount"],
                        color = p.fg,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                },
            )

            Spacer(Modifier.height(8.dp))
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SettingRow(
                    icon = DogmaIconKind.CARD,
                    title = t["tariff"],
                    onClick = soon,
                    trailing = {
                        Text(t["change"], color = p.muted, fontSize = 12.5.sp)
                    },
                    showChevron = true,
                )
                SettingRow(
                    icon = DogmaIconKind.CARD,
                    title = t["paymentMethods"],
                    onClick = soon,
                    showChevron = true,
                )
                SettingRow(
                    icon = DogmaIconKind.CLOCK,
                    title = t["paymentHistory"],
                    onClick = soon,
                    showChevron = true,
                )
                SettingRow(
                    icon = DogmaIconKind.HELP,
                    title = t["support"],
                    subtitle = t["supportHint"],
                    onClick = onOpenChat,
                    trailing = {
                        ChatBadge(state.chat.unread)
                    },
                    showChevron = true,
                )
            }

            Spacer(Modifier.height(14.dp))
            OutlineButton(
                text = t["logout"],
                onClick = onLogout,
                danger = true,
                icon = DogmaIconKind.POWER,
            )
        }
    }
}
