package com.dogma.portal.ui.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dogma.portal.AppState
import com.dogma.portal.ui.Strings
import com.dogma.portal.ui.components.ChatBadge
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
    val status = state.subStatus
    val displayName = state.user?.name?.takeIf { it.isNotBlank() }
        ?: state.user?.email?.takeIf { it.isNotBlank() }
        ?: "—"
    val displayEmail = state.user?.email?.takeIf {
        it.isNotBlank() && it != displayName
    }
    val initial = displayName.firstOrNull { it.isLetterOrDigit() }?.uppercase() ?: "?"

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
                Box(
                    modifier = Modifier
                        .size(52.dp)
                        .background(p.chipBg, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        initial,
                        color = p.fg,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
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
            val titleColor = when (status) {
                "active" -> p.warning
                "denied" -> p.danger
                else -> p.muted
            }
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(p.card, RoundedCornerShape(14.dp))
                    .border(1.dp, p.border, RoundedCornerShape(14.dp))
                    .padding(horizontal = 18.dp, vertical = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(
                        t["subscription"],
                        color = p.muted,
                        fontSize = 11.sp,
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = when (status) {
                            "active" -> t["subActive"]
                            "pending" -> t["planPending"]
                            "denied" -> t["planDenied"]
                            else -> t["planNone"]
                        },
                        color = titleColor,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        t["until"],
                        color = p.muted,
                        fontSize = 11.sp,
                    )
                    Spacer(Modifier.height(3.dp))
                    Text(
                        if (status == "active") formatDate(state.subscription?.expiresAt) else "—",
                        color = if (status == "active") p.fg else p.muted,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.Medium,
                    )
                }
            }

            Spacer(Modifier.height(14.dp))
            SettingRow(
                title = t["support"],
                subtitle = t["supportHint"],
                onClick = onOpenChat,
                trailing = {
                    ChatBadge(state.chat.unread)
                },
                showChevron = true,
            )

            Spacer(Modifier.height(14.dp))
            OutlineButton(
                text = t["logout"],
                onClick = onLogout,
                danger = true,
            )
        }
    }
}
