package com.dogma.portal.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dogma.portal.ChatUi
import com.dogma.portal.data.ChatMessage
import com.dogma.portal.ui.Strings
import com.dogma.portal.ui.components.DogmaTextField
import com.dogma.portal.ui.components.DogmaIcon
import com.dogma.portal.ui.components.DogmaIconKind
import com.dogma.portal.ui.components.MiniButton
import com.dogma.portal.ui.theme.dogmaPalette
import com.dogma.portal.util.formatTime
import kotlinx.coroutines.delay

@Composable
fun ChatScreen(
    chat: ChatUi,
    t: Strings,
    onClose: () -> Unit,
    onRefresh: () -> Unit,
    onSend: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = dogmaPalette()
    var text by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    LaunchedEffect(Unit) {
        while (true) {
            onRefresh()
            delay(5_000)
        }
    }
    LaunchedEffect(chat.messages.size) {
        if (chat.messages.isNotEmpty()) {
            listState.animateScrollToItem(chat.messages.lastIndex)
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(p.bg)
            .imePadding(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                t["chatTitle"],
                color = p.fg,
                fontSize = 17.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.weight(1f),
            )
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .clickable(onClick = onClose)
                    .semantics { contentDescription = t["close"] },
                contentAlignment = Alignment.Center,
            ) {
                DogmaIcon(DogmaIconKind.CLOSE, Modifier.size(19.dp), tint = p.muted)
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(p.border))

        if (chat.messages.isEmpty()) {
            Box(
                modifier = Modifier.weight(1f).fillMaxWidth().padding(24.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    t["chatEmpty"],
                    color = p.muted,
                    fontSize = 13.sp,
                )
            }
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).fillMaxWidth(),
                contentPadding = PaddingValues(14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(chat.messages) { message ->
                    ChatBubble(message)
                }
            }
        }

        if (!chat.error.isNullOrBlank()) {
            Text(
                chat.error.orEmpty(),
                color = p.danger,
                fontSize = 12.sp,
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 4.dp),
            )
        }

        Box(Modifier.fillMaxWidth().height(1.dp).background(p.border))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            DogmaTextField(
                value = text,
                onValueChange = { text = it },
                placeholder = t["chatPlaceholder"],
                modifier = Modifier.weight(1f),
                imeAction = androidx.compose.ui.text.input.ImeAction.Send,
                onDone = {
                    val value = text.trim()
                    if (value.isNotEmpty() && !chat.sending) {
                        onSend(value)
                        text = ""
                    }
                },
            )
            MiniButton(
                text = t["send"],
                onClick = {
                    val value = text.trim()
                    if (value.isNotEmpty() && !chat.sending) {
                        onSend(value)
                        text = ""
                    }
                },
                enabled = text.isNotBlank() && !chat.sending,
            )
        }
    }
}

@Composable
private fun ChatBubble(message: ChatMessage) {
    val p = dogmaPalette()
    val mine = message.sender == "user"
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start,
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 300.dp)
                .background(
                    color = if (mine) p.warning else p.bg,
                    shape = RoundedCornerShape(
                        topStart = 14.dp,
                        topEnd = 14.dp,
                        bottomStart = if (mine) 14.dp else 4.dp,
                        bottomEnd = if (mine) 4.dp else 14.dp,
                    ),
                )
                .then(
                    if (mine) Modifier else Modifier.border(
                        1.dp,
                        p.border,
                        RoundedCornerShape(
                            topStart = 14.dp,
                            topEnd = 14.dp,
                            bottomStart = 4.dp,
                            bottomEnd = 14.dp,
                        ),
                    ),
                )
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            Text(
                message.text,
                color = if (mine) androidx.compose.ui.graphics.Color(0xFF1A1400) else p.fg,
                fontSize = 13.5.sp,
                lineHeight = 19.sp,
            )
            val time = formatTime(message.createdAt)
            if (time.isNotBlank()) {
                Spacer(Modifier.height(3.dp))
                Text(
                    time,
                    color = if (mine) p.accentFg.copy(alpha = 0.55f) else p.muted,
                    fontSize = 10.sp,
                )
            }
        }
    }
}
