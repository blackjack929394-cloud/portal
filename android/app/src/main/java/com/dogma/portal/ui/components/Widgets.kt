package com.dogma.portal.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.dogma.portal.R
import com.dogma.portal.data.Prefs
import com.dogma.portal.data.ProxyNode
import com.dogma.portal.data.SpeedPoint
import com.dogma.portal.ui.Strings
import com.dogma.portal.ui.theme.DogmaPalette
import com.dogma.portal.ui.theme.dogmaPalette
import com.dogma.portal.vpn.VpnState
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.roundToInt

// ── brand ───────────────────────────────────────────────────────────────────

@Composable
fun AppMark(
    size: Dp = 24.dp,
    modifier: Modifier = Modifier,
    tint: Color = dogmaPalette().fg,
) {
    Image(
        painter = painterResource(R.drawable.ic_launcher_foreground),
        contentDescription = "DOGMA",
        contentScale = ContentScale.Fit,
        colorFilter = ColorFilter.tint(tint),
        modifier = modifier.size(size),
    )
}

@Composable
fun DogmaTopBar(
    lang: com.dogma.portal.ui.Lang,
    tagline: String,
    onLang: (com.dogma.portal.ui.Lang) -> Unit,
    modifier: Modifier = Modifier,
    userInitial: String? = null,
    profileLabel: String = "",
    onProfile: (() -> Unit)? = null,
) {
    val p = dogmaPalette()
    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(64.dp)
            .padding(horizontal = 20.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        AppMark(size = 22.dp)
        Spacer(Modifier.width(10.dp))
        Column {
            Text(
                text = "DOGMA",
                color = p.fg,
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 2.2.sp,
            )
            Text(
                text = tagline,
                color = p.muted,
                fontSize = 10.5.sp,
            )
        }
        Spacer(Modifier.weight(1f))
        Text(
            text = "РУ",
            color = if (lang == com.dogma.portal.ui.Lang.RU) p.warning else p.muted,
            fontSize = 13.sp,
            letterSpacing = 0.4.sp,
            modifier = Modifier
                .clickable { onLang(com.dogma.portal.ui.Lang.RU) }
                .padding(horizontal = 3.dp, vertical = 4.dp),
        )
        Text(
            text = "/",
            color = p.muted.copy(alpha = 0.45f),
            fontSize = 12.sp,
            modifier = Modifier.padding(horizontal = 2.dp),
        )
        Text(
            text = "EN",
            color = if (lang == com.dogma.portal.ui.Lang.EN) p.warning else p.muted,
            fontSize = 13.sp,
            letterSpacing = 0.4.sp,
            modifier = Modifier
                .clickable { onLang(com.dogma.portal.ui.Lang.EN) }
                .padding(horizontal = 3.dp, vertical = 4.dp),
        )
        if (userInitial != null && onProfile != null) {
            Spacer(Modifier.width(4.dp))
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(CircleShape)
                    .background(p.card)
                    .border(1.dp, p.border, CircleShape)
                    .clickable(onClick = onProfile)
                    .semantics { contentDescription = profileLabel },
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    userInitial,
                    color = p.fg,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                )
            }
        }
    }
}

// ── icons ───────────────────────────────────────────────────────────────────

enum class DogmaIconKind {
    HOME, SERVERS, SETTINGS, STATS, PROFILE,
    SHIELD, BOLT, POWER, GLOBE, KEY, SUN, GEAR, DEVICES,
    CLOCK, UP, DOWN, CARD, HELP, SEARCH, STAR, SIGNAL,
    CHEVRON, CHECK, WARN, SEND, CLOSE, SCAN,
}

@Composable
fun DogmaIcon(
    kind: DogmaIconKind,
    modifier: Modifier = Modifier.size(20.dp),
    tint: Color = dogmaPalette().fg,
    strokeWidth: Dp = 1.7.dp,
) {
    Canvas(modifier) {
        val u = size.minDimension / 20f
        val sw = strokeWidth.toPx()
        val style = Stroke(sw, cap = StrokeCap.Round, join = StrokeJoin.Round)
        fun o(x: Float, y: Float) = Offset(x * u, y * u)
        fun line(x1: Float, y1: Float, x2: Float, y2: Float) =
            drawLine(tint, o(x1, y1), o(x2, y2), sw, StrokeCap.Round)
        fun path(fillPath: Boolean = false, block: Path.() -> Unit) {
            val p = Path().apply(block)
            if (fillPath) drawPath(p, tint) else drawPath(p, tint, style = style)
        }

        when (kind) {
            DogmaIconKind.HOME -> {
                path {
                    moveTo(3 * u, 9.5f * u); lineTo(10 * u, 3.5f * u); lineTo(17 * u, 9.5f * u)
                    lineTo(17 * u, 16 * u); lineTo(3 * u, 16 * u); close()
                }
                path {
                    moveTo(8 * u, 16 * u); lineTo(8 * u, 11 * u); lineTo(12 * u, 11 * u)
                    lineTo(12 * u, 16 * u)
                }
            }
            DogmaIconKind.SERVERS -> {
                drawRoundRect(tint, o(3f, 3.5f), Size(14 * u, 5.5f * u), CornerRadius(1.5f * u), style = style)
                drawRoundRect(tint, o(3f, 11f), Size(14 * u, 5.5f * u), CornerRadius(1.5f * u), style = style)
                drawCircle(tint, 0.9f * u, o(6f, 6.2f))
                drawCircle(tint, 0.9f * u, o(6f, 13.8f))
            }
            DogmaIconKind.SETTINGS -> {
                drawRoundRect(tint, o(3f, 3f), Size(14 * u, 14 * u), CornerRadius(3f * u), style = style)
                line(7f, 8f, 13f, 8f)
                line(7f, 12f, 13f, 12f)
            }
            DogmaIconKind.STATS -> {
                path {
                    moveTo(3 * u, 15 * u); lineTo(7.5f * u, 9.5f * u); lineTo(11 * u, 12.5f * u)
                    lineTo(17 * u, 5 * u)
                }
                line(13.5f, 5f, 17f, 5f)
                line(17f, 5f, 17f, 8.5f)
            }
            DogmaIconKind.PROFILE -> {
                drawCircle(tint, 3.2f * u, o(10f, 6.5f), style = style)
                path {
                    moveTo(4 * u, 17 * u)
                    cubicTo(4.5f * u, 13 * u, 7 * u, 11.5f * u, 10 * u, 11.5f * u)
                    cubicTo(13 * u, 11.5f * u, 15.5f * u, 13 * u, 16 * u, 17 * u)
                }
            }
            DogmaIconKind.SHIELD -> path {
                moveTo(10 * u, 2.5f * u); lineTo(16.5f * u, 5 * u); lineTo(16.5f * u, 10 * u)
                cubicTo(16.5f * u, 14 * u, 13.5f * u, 16.5f * u, 10 * u, 17.5f * u)
                cubicTo(6.5f * u, 16.5f * u, 3.5f * u, 14 * u, 3.5f * u, 10 * u)
                lineTo(3.5f * u, 5 * u); close()
            }
            DogmaIconKind.BOLT -> path {
                moveTo(11 * u, 2.5f * u); lineTo(4.5f * u, 11 * u); lineTo(9 * u, 11 * u)
                lineTo(8 * u, 17.5f * u); lineTo(15.5f * u, 8.5f * u); lineTo(10.5f * u, 8.5f * u)
                close()
            }
            DogmaIconKind.POWER -> {
                line(10f, 3f, 10f, 10f)
                drawArc(
                    tint, startAngle = 130f, sweepAngle = 280f, useCenter = false,
                    topLeft = o(4f, 4f), size = Size(12 * u, 12 * u), style = style,
                )
            }
            DogmaIconKind.GLOBE -> {
                drawCircle(tint, 7 * u, o(10f, 10f), style = style)
                drawOval(tint, o(6.8f, 3f), Size(6.4f * u, 14 * u), style = style)
                line(3.3f, 8f, 16.7f, 8f)
                line(3.3f, 12f, 16.7f, 12f)
            }
            DogmaIconKind.KEY -> {
                drawCircle(tint, 3.5f * u, o(7f, 13f), style = style)
                line(9.5f, 10.5f, 16f, 4f)
                line(13.5f, 6.5f, 16f, 9f)
            }
            DogmaIconKind.SUN -> {
                drawCircle(tint, 3.5f * u, o(10f, 10f), style = style)
                val rays = listOf(
                    10f to 2.5f to (10f to 4.5f), 10f to 15.5f to (10f to 17.5f),
                    2.5f to 10f to (4.5f to 10f), 15.5f to 10f to (17.5f to 10f),
                    4.7f to 4.7f to (6.1f to 6.1f), 13.9f to 13.9f to (15.3f to 15.3f),
                    15.3f to 4.7f to (13.9f to 6.1f), 6.1f to 13.9f to (4.7f to 15.3f),
                )
                rays.forEach { (a, b) -> line(a.first, a.second, b.first, b.second) }
            }
            DogmaIconKind.GEAR -> {
                drawCircle(tint, 2.6f * u, o(10f, 10f), style = style)
                val rays = listOf(
                    10f to 2.8f to (10f to 5.2f), 10f to 14.8f to (10f to 17.2f),
                    3.8f to 6.4f to (5.9f to 7.6f), 14.1f to 12.4f to (16.2f to 13.6f),
                    3.8f to 13.6f to (5.9f to 12.4f), 14.1f to 7.6f to (16.2f to 6.4f),
                )
                rays.forEach { (a, b) -> line(a.first, a.second, b.first, b.second) }
            }
            DogmaIconKind.DEVICES -> {
                drawRoundRect(tint, o(2.5f, 4f), Size(11 * u, 8 * u), CornerRadius(1.5f * u), style = style)
                line(6f, 15.5f, 10f, 15.5f)
                line(8f, 12f, 8f, 15.5f)
                drawRoundRect(tint, o(14.5f, 7f), Size(4 * u, 8.5f * u), CornerRadius(1.2f * u), style = style)
            }
            DogmaIconKind.CLOCK -> {
                drawCircle(tint, 7 * u, o(10f, 10f), style = style)
                line(10f, 6f, 10f, 10.3f)
                line(10f, 10.3f, 13f, 12f)
            }
            DogmaIconKind.UP -> {
                line(10f, 16f, 10f, 4f)
                path { moveTo(5.5f * u, 8.5f * u); lineTo(10 * u, 4 * u); lineTo(14.5f * u, 8.5f * u) }
            }
            DogmaIconKind.DOWN -> {
                line(10f, 4f, 10f, 16f)
                path { moveTo(5.5f * u, 11.5f * u); lineTo(10 * u, 16 * u); lineTo(14.5f * u, 11.5f * u) }
            }
            DogmaIconKind.CARD -> {
                drawRoundRect(tint, o(2.5f, 4.5f), Size(15 * u, 11 * u), CornerRadius(2 * u), style = style)
                line(2.5f, 8.5f, 17.5f, 8.5f)
            }
            DogmaIconKind.HELP -> {
                drawCircle(tint, 7 * u, o(10f, 10f), style = style)
                path {
                    moveTo(7.8f * u, 7.8f * u)
                    cubicTo(8.1f * u, 6.5f * u, 9f * u, 6f * u, 10f * u, 6f * u)
                    cubicTo(11.3f * u, 6f * u, 12f * u, 7f * u, 12f * u, 8f * u)
                    cubicTo(12f * u, 9.4f * u, 10.4f * u, 9.4f * u, 10.2f * u, 10.8f * u)
                }
                drawCircle(tint, 0.6f * u, o(10f, 14f))
            }
            DogmaIconKind.SEARCH -> {
                drawCircle(tint, 5.5f * u, o(9f, 9f), style = style)
                line(13.5f, 13.5f, 17f, 17f)
            }
            DogmaIconKind.STAR -> path(fillPath = true) {
                moveTo(10 * u, 2.8f * u); lineTo(12.2f * u, 7.4f * u); lineTo(17.2f * u, 8.1f * u)
                lineTo(13.6f * u, 11.6f * u); lineTo(14.5f * u, 16.6f * u)
                lineTo(10 * u, 14.2f * u); lineTo(5.5f * u, 16.6f * u)
                lineTo(6.4f * u, 11.6f * u); lineTo(2.8f * u, 8.1f * u)
                lineTo(7.8f * u, 7.4f * u); close()
            }
            DogmaIconKind.SIGNAL -> {
                drawRoundRect(tint, o(3f, 12f), Size(2.4f * u, 5 * u), CornerRadius(1f * u))
                drawRoundRect(tint, o(7.2f, 9f), Size(2.4f * u, 8 * u), CornerRadius(1f * u))
                drawRoundRect(tint, o(11.4f, 6f), Size(2.4f * u, 11 * u), CornerRadius(1f * u))
                drawRoundRect(tint, o(15.6f, 3f), Size(2.4f * u, 14 * u), CornerRadius(1f * u))
            }
            DogmaIconKind.CHEVRON -> path {
                moveTo(7 * u, 4.5f * u); lineTo(12.5f * u, 10 * u); lineTo(7 * u, 15.5f * u)
            }
            DogmaIconKind.CHECK -> path {
                moveTo(4.5f * u, 10.5f * u); lineTo(8.5f * u, 14 * u); lineTo(15.5f * u, 6 * u)
            }
            DogmaIconKind.WARN -> {
                path {
                    moveTo(10 * u, 2.5f * u); lineTo(18f * u, 17 * u); lineTo(2f * u, 17 * u); close()
                }
                line(10f, 7.5f, 10f, 12f)
                drawCircle(tint, 0.7f * u, o(10f, 14.3f))
            }
            DogmaIconKind.SEND -> path {
                moveTo(3 * u, 10 * u); lineTo(17 * u, 3.5f * u); lineTo(13 * u, 16.5f * u)
                lineTo(10.2f * u, 11.6f * u); close()
                moveTo(10.2f * u, 11.6f * u); lineTo(17 * u, 3.5f * u)
            }
            DogmaIconKind.CLOSE -> {
                line(5f, 5f, 15f, 15f)
                line(15f, 5f, 5f, 15f)
            }
            DogmaIconKind.SCAN -> {
                // четыре угла видоискателя + центральная точка
                line(3f, 7f, 3f, 3f); line(3f, 3f, 7f, 3f)
                line(13f, 3f, 17f, 3f); line(17f, 3f, 17f, 7f)
                line(3f, 13f, 3f, 17f); line(3f, 17f, 7f, 17f)
                line(13f, 17f, 17f, 17f); line(17f, 17f, 17f, 13f)
                drawCircle(tint, 1.1f * u, o(10f, 10f))
            }
        }
    }
}

// ── buttons & inputs ────────────────────────────────────────────────────────

@Composable
fun PrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    fillWidth: Boolean = true,
) {
    val p = dogmaPalette()
    val sizing = if (fillWidth) Modifier.fillMaxWidth() else Modifier.widthIn(min = 0.dp)
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.then(sizing).height(44.dp),
        shape = RoundedCornerShape(8.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = p.accent,
            contentColor = p.accentFg,
            disabledContainerColor = p.track,
            disabledContentColor = p.muted,
        ),
        contentPadding = PaddingValues(horizontal = 20.dp),
        elevation = null,
    ) {
        Text(text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun OutlineButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    fillWidth: Boolean = true,
    danger: Boolean = false,
) {
    val p = dogmaPalette()
    val sizing = if (fillWidth) Modifier.fillMaxWidth() else Modifier.widthIn(min = 0.dp)
    val fg = if (danger) p.danger else p.fg
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.then(sizing).height(44.dp),
        shape = RoundedCornerShape(8.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = p.card,
            contentColor = fg,
            disabledContainerColor = p.card,
            disabledContentColor = p.muted,
        ),
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            if (danger) p.danger.copy(alpha = 0.4f) else p.border,
        ),
        contentPadding = PaddingValues(horizontal = 20.dp),
        elevation = null,
    ) {
        Text(text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun MiniButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val p = dogmaPalette()
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(36.dp),
        shape = RoundedCornerShape(8.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = p.accent,
            contentColor = p.accentFg,
            disabledContainerColor = p.track,
            disabledContentColor = p.muted,
        ),
        contentPadding = PaddingValues(horizontal = 14.dp),
        elevation = null,
    ) {
        Text(text, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
fun LinkText(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, color: Color? = null) {
    val p = dogmaPalette()
    Text(
        text = text,
        color = color ?: p.muted,
        fontSize = 14.sp,
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 4.dp, vertical = 8.dp),
    )
}

@Composable
fun DogmaTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    label: String? = null,
    password: Boolean = false,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Next,
    onDone: (() -> Unit)? = null,
    enabled: Boolean = true,
) {
    val p = dogmaPalette()
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()

    Column(modifier.fillMaxWidth()) {
        if (label != null) {
            Text(label, color = p.muted, fontSize = 13.sp)
            Spacer(Modifier.height(8.dp))
        }
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            enabled = enabled,
            singleLine = true,
            textStyle = TextStyle(fontSize = 14.sp, color = p.fg),
            cursorBrush = SolidColor(p.warning),
            visualTransformation = if (password) PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions = KeyboardOptions(
                keyboardType = keyboardType,
                imeAction = imeAction,
                autoCorrect = false,
            ),
            keyboardActions = KeyboardActions(onDone = { onDone?.invoke() }),
            interactionSource = interaction,
            modifier = Modifier
                .fillMaxWidth()
                .height(44.dp)
                .background(p.bg, RoundedCornerShape(8.dp))
                .border(1.dp, if (focused) p.warning else p.border, RoundedCornerShape(8.dp))
                .padding(horizontal = 12.dp),
            decorationBox = { inner ->
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.CenterStart) {
                    if (value.isEmpty() && placeholder.isNotEmpty()) {
                        Text(
                            placeholder,
                            fontSize = 14.sp,
                            color = Color(0xFF736D63),
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    }
                    inner()
                }
            },
        )
    }
}

// ── cards / rows ────────────────────────────────────────────────────────────

@Composable
fun CardBox(
    modifier: Modifier = Modifier,
    padding: Dp = 16.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    val p = dogmaPalette()
    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(p.card, RoundedCornerShape(14.dp))
            .border(1.dp, p.border, RoundedCornerShape(14.dp))
            .padding(padding),
        content = content,
    )
}

@Composable
fun PageTitle(text: String, modifier: Modifier = Modifier) {
    val p = dogmaPalette()
    Text(
        text = text,
        color = p.fg,
        fontSize = 22.sp,
        fontWeight = FontWeight.Medium,
        modifier = modifier,
    )
}

@Composable
fun Caption(text: String, modifier: Modifier = Modifier) {
    val p = dogmaPalette()
    Text(text = text, color = p.muted, fontSize = 12.sp, modifier = modifier)
}

@Composable
fun SettingRow(
    title: String,
    subtitle: String? = null,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null,
    trailing: @Composable (() -> Unit)? = null,
    showChevron: Boolean = false,
) {
    val p = dogmaPalette()
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(p.card, RoundedCornerShape(10.dp))
            .border(1.dp, p.border, RoundedCornerShape(10.dp))
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 15.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = p.fg, fontSize = 14.sp, fontWeight = FontWeight.Medium)
            if (!subtitle.isNullOrBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(
                    subtitle,
                    color = p.muted,
                    fontSize = 11.5.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (trailing != null) {
            Spacer(Modifier.width(10.dp))
            trailing()
        }
        if (showChevron) {
            Spacer(Modifier.width(6.dp))
            DogmaIcon(DogmaIconKind.CHEVRON, Modifier.size(15.dp), tint = p.muted)
        }
    }
}

@Composable
fun DogmaSwitch(checked: Boolean, onCheckedChange: (Boolean) -> Unit, modifier: Modifier = Modifier) {
    val p = dogmaPalette()
    Switch(
        checked = checked,
        onCheckedChange = onCheckedChange,
        modifier = modifier,
        colors = SwitchDefaults.colors(
            checkedThumbColor = p.accentFg,
            checkedTrackColor = p.warning,
            checkedBorderColor = p.warning,
            uncheckedThumbColor = p.muted,
            uncheckedTrackColor = p.track,
            uncheckedBorderColor = p.border,
        ),
    )
}

@Composable
fun SearchBox(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
) {
    DogmaTextField(
        value = value,
        onValueChange = onValueChange,
        placeholder = placeholder,
        modifier = modifier,
        imeAction = ImeAction.Search,
    )
}

// ── flags ───────────────────────────────────────────────────────────────────

private data class FlagSpec(val colors: List<Color>, val vertical: Boolean)

private val FLAG_SPECS: List<Pair<Regex, FlagSpec>> = listOf(
    Regex("german|frankfurt|berlin|герман", RegexOption.IGNORE_CASE) to
        FlagSpec(listOf(Color(0xFF3A3A3A), Color(0xFFD02F2F), Color(0xFFF2C02C)), false),
    Regex("nether|amsterdam|голланд|нидерл|\\bnl\\b", RegexOption.IGNORE_CASE) to
        FlagSpec(listOf(Color(0xFFC8102E), Color.White, Color(0xFF1E4785)), false),
    Regex("france|paris|франц", RegexOption.IGNORE_CASE) to
        FlagSpec(listOf(Color(0xFF1E4785), Color.White, Color(0xFFC8102E)), true),
    Regex("rus|moscow|росси", RegexOption.IGNORE_CASE) to
        FlagSpec(listOf(Color.White, Color(0xFF1E4785), Color(0xFFC8102E)), false),
    Regex("usa|united states|america|сша", RegexOption.IGNORE_CASE) to
        FlagSpec(listOf(Color(0xFFB22234), Color.White, Color(0xFF3C3B6E)), false),
    Regex("japan|япони", RegexOption.IGNORE_CASE) to
        FlagSpec(listOf(Color.White, Color(0xFFBC002D), Color.White), false),
    Regex("kingdom|london|британ|\\buk\\b", RegexOption.IGNORE_CASE) to
        FlagSpec(listOf(Color(0xFF012169), Color.White, Color(0xFFC8102E)), false),
    Regex("canada|канад", RegexOption.IGNORE_CASE) to
        FlagSpec(listOf(Color(0xFFD52B1E), Color.White, Color(0xFFD52B1E)), true),
    Regex("austral|австрал", RegexOption.IGNORE_CASE) to
        FlagSpec(listOf(Color(0xFF00247D), Color.White, Color(0xFF00247D)), false),
)

@Composable
fun FlagCircle(name: String, modifier: Modifier = Modifier, diameter: Dp = 30.dp) {
    val spec = FLAG_SPECS.firstOrNull { it.first.containsMatchIn(name) }?.second
    Box(
        modifier = modifier
            .size(diameter)
            .clip(CircleShape)
            .background(Color(0xFF333333)),
        contentAlignment = Alignment.Center,
    ) {
        if (spec != null) {
            Canvas(Modifier.fillMaxSize()) {
                val w = size.width
                val h = size.height
                clipPath(Path().apply { addOval(Rect(0f, 0f, w, h)) }) {
                    if (spec.vertical) {
                        val stripe = w / 3f
                        spec.colors.forEachIndexed { i, c ->
                            drawRect(c, Offset(i * stripe, 0f), Size(stripe + 1f, h))
                        }
                    } else {
                        val stripe = h / 3f
                        spec.colors.forEachIndexed { i, c ->
                            drawRect(c, Offset(0f, i * stripe), Size(w, stripe + 1f))
                        }
                    }
                }
            }
        } else {
            val initials = name.filter { it.isLetterOrDigit() }.take(2).uppercase().ifBlank { "??" }
            Text(initials, color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
fun ServerRow(
    node: ProxyNode,
    selected: Boolean,
    ping: Int?,
    pendingPing: Boolean,
    favorite: Boolean,
    favoriteContentDescription: String,
    onSelect: () -> Unit,
    onToggleFavorite: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = dogmaPalette()
    Row(
        modifier = modifier
            .fillMaxWidth()
            .background(p.card, RoundedCornerShape(10.dp))
            .border(
                width = 1.dp,
                color = if (selected) p.warning else p.border,
                shape = RoundedCornerShape(10.dp),
            )
            .clickable(onClick = onSelect)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        FlagCircle(node.name)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                node.name,
                color = p.fg,
                fontSize = 13.5.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                node.hostPort,
                color = p.muted,
                fontSize = 11.5.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            text = when {
                pendingPing -> "…"
                ping != null -> "$ping ms"
                else -> "—"
            },
            color = p.muted,
            fontSize = 12.sp,
        )
        Spacer(Modifier.width(6.dp))
        Box(
            modifier = Modifier
                .size(34.dp)
                .clip(RoundedCornerShape(7.dp))
                .clickable(onClick = onToggleFavorite)
                .semantics { contentDescription = favoriteContentDescription },
            contentAlignment = Alignment.Center,
        ) {
            DogmaIcon(
                DogmaIconKind.STAR,
                Modifier.size(17.dp),
                tint = if (favorite) p.warning else p.muted,
            )
        }
    }
}

// ── stats widgets ───────────────────────────────────────────────────────────

@Composable
fun StatCard(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
) {
    val p = dogmaPalette()
    Column(
        modifier = modifier
            .background(p.card, RoundedCornerShape(14.dp))
            .border(1.dp, p.border, RoundedCornerShape(14.dp))
            .padding(horizontal = 15.dp, vertical = 13.dp),
    ) {
        Text(label, color = p.muted, fontSize = 12.sp)
        Spacer(Modifier.height(3.dp))
        Text(value, color = p.fg, fontSize = 17.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun RangeTabs(
    selected: String,
    t: Strings,
    onSelect: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = dogmaPalette()
    val options = listOf("today", "week", "month", "year")
    Row(
        modifier = modifier
            .background(p.card, RoundedCornerShape(11.dp))
            .border(1.dp, p.border, RoundedCornerShape(11.dp))
            .padding(3.dp),
    ) {
        options.forEach { key ->
            val on = key == selected
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(7.dp))
                    .background(if (on) p.track else Color.Transparent)
                    .border(
                        1.dp,
                        if (on) p.warning.copy(alpha = 0.55f) else Color.Transparent,
                        RoundedCornerShape(7.dp),
                    )
                    .clickable { onSelect(key) }
                    .padding(horizontal = 14.dp, vertical = 7.dp),
            ) {
                Text(
                    t[key],
                    color = if (on) p.warning else p.muted,
                    fontSize = 12.5.sp,
                    fontWeight = if (on) FontWeight.Medium else FontWeight.Normal,
                )
            }
        }
    }
}

@Composable
fun SpeedChart(
    points: List<SpeedPoint>,
    modifier: Modifier = Modifier,
    emptyText: String = "",
    collectingText: String = "",
) {
    val p = dogmaPalette()
    Box(modifier.fillMaxWidth().height(140.dp), contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height
            drawLine(p.track, Offset(0f, h - 1f), Offset(w, h - 1f), 1f)
            if (points.size >= 2) {
                val maxValue = max(1024.0, points.maxOf { max(it.down, it.up) }) * 1.15
                fun lineFor(values: List<Double>, color: Color, width: Float) {
                    val path = Path()
                    values.forEachIndexed { i, value ->
                        val x = (i / 59f) * w
                        val y = h - (value / maxValue).toFloat() * (h - 8f) - 4f
                        if (i == 0) path.moveTo(x, y) else path.lineTo(x, y)
                    }
                    drawPath(path, color, style = Stroke(width, cap = StrokeCap.Round, join = StrokeJoin.Round))
                }
                lineFor(points.map { it.down }, p.warning, 1.8.dp.toPx())
                lineFor(points.map { it.up }, p.muted, 1.4.dp.toPx())

                // Подписи серий прямо у последних точек вместо легенды.
                val last = points.lastIndex
                val endX = ((last / 59f) * w).coerceAtMost(w - 14.dp.toPx())
                val paint = android.graphics.Paint().apply {
                    isAntiAlias = true
                    textSize = 11.sp.toPx()
                    typeface = android.graphics.Typeface.DEFAULT_BOLD
                }
                val lastDownY = h - (points.last().down / maxValue).toFloat() * (h - 8f) - 4f
                val lastUpY = h - (points.last().up / maxValue).toFloat() * (h - 8f) - 4f
                paint.color = p.warning.toArgb()
                drawContext.canvas.nativeCanvas.drawText("↓", endX, lastDownY.coerceIn(12.dp.toPx(), h - 4.dp.toPx()), paint)
                paint.color = p.muted.toArgb()
                drawContext.canvas.nativeCanvas.drawText("↑", endX, lastUpY.coerceIn(12.dp.toPx(), h - 4.dp.toPx()), paint)
            }
        }
        if (points.size < 2 && (emptyText.isNotBlank() || collectingText.isNotBlank())) {
            Text(
                text = if (collectingText.isNotBlank()) collectingText else emptyText,
                color = p.muted,
                fontSize = 12.sp,
            )
        }
    }
}

// ── VPN visuals ─────────────────────────────────────────────────────────────

@Composable
fun VpnRing(
    state: VpnState,
    enabled: Boolean,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    inner: @Composable BoxScope.() -> Unit,
) {
    val p = dogmaPalette()
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed && enabled) 0.975f else 1f,
        label = "ringScale",
    )
    val transition = rememberInfiniteTransition(label = "ring")
    val angle by transition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(1400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "ringAngle",
    )
    Box(
        modifier = modifier
            .size(240.dp)
            .graphicsLayer(scaleX = scale, scaleY = scale)
            .clip(CircleShape)
            .clickable(
                interactionSource = interaction,
                indication = androidx.compose.foundation.LocalIndication.current,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick,
            )
            .semantics {
                this.contentDescription = contentDescription
                role = Role.Button
            },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val stroke = 5.dp.toPx()
            val radius = (size.minDimension - stroke) / 2f - 4.dp.toPx()
            val center = Offset(size.width / 2f, size.height / 2f)
            drawCircle(p.track, radius, center, style = Stroke(stroke))
            when (state) {
                VpnState.CONNECTED -> {
                    drawArc(
                        color = p.warning,
                        startAngle = -90f,
                        sweepAngle = 360f,
                        useCenter = false,
                        topLeft = Offset(center.x - radius, center.y - radius),
                        size = Size(radius * 2, radius * 2),
                        style = Stroke(stroke, cap = StrokeCap.Round),
                    )
                    drawCircle(p.warning, 5.dp.toPx(), Offset(center.x, center.y - radius))
                }
                VpnState.CONNECTING -> {
                    drawArc(
                        color = p.warning,
                        startAngle = angle,
                        sweepAngle = 80f,
                        useCenter = false,
                        topLeft = Offset(center.x - radius, center.y - radius),
                        size = Size(radius * 2, radius * 2),
                        style = Stroke(stroke, cap = StrokeCap.Round),
                    )
                }
                else -> Unit
            }
        }
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(28.dp)
                .background(p.card, CircleShape)
                .border(1.dp, p.border, CircleShape),
            contentAlignment = Alignment.Center,
            content = inner,
        )
    }
}

@Composable
fun ConnectingDots(modifier: Modifier = Modifier) {
    val p = dogmaPalette()
    val transition = rememberInfiniteTransition(label = "dots")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "dotsPhase",
    )
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        repeat(8) { i ->
            val shifted = (phase + i / 8f) % 1f
            val alpha = 0.25f + 0.75f * abs(sin(shifted * PI)).toFloat()
            Box(Modifier.size(7.dp).background(p.fg.copy(alpha = alpha), CircleShape))
        }
    }
}

@Composable
fun ChatBadge(count: Int, modifier: Modifier = Modifier) {
    if (count <= 0) return
    val p = dogmaPalette()
    Box(
        modifier = modifier
            .height(18.dp)
            .widthIn(min = 18.dp)
            .background(p.warning, CircleShape)
            .padding(horizontal = 5.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            if (count > 99) "99+" else count.toString(),
            color = p.accentFg,
            fontSize = 10.5.sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

// ── server dialog ───────────────────────────────────────────────────────────

@Composable
fun ServerDialog(
    current: String,
    t: Strings,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    val p = dogmaPalette()
    var value by remember { androidx.compose.runtime.mutableStateOf(current) }
    var error by remember { androidx.compose.runtime.mutableStateOf<String?>(null) }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().padding(20.dp), contentAlignment = Alignment.Center) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .widthIn(max = 420.dp)
                    .background(p.card, RoundedCornerShape(16.dp))
                    .border(1.dp, p.border, RoundedCornerShape(16.dp))
                    .padding(22.dp),
            ) {
                Text(t["serverTitle"], color = p.fg, fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(6.dp))
                Text(t["serverHint"], color = p.muted, fontSize = 12.sp)
                Spacer(Modifier.height(16.dp))
                DogmaTextField(
                    value = value,
                    onValueChange = {
                        value = it
                        error = null
                    },
                    placeholder = "https://192-144-56-63.sslip.io",
                    keyboardType = KeyboardType.Uri,
                    imeAction = ImeAction.Done,
                    onDone = {
                        if (Prefs.isValidBaseUrl(value)) onSave(Prefs.normalizeBaseUrl(value))
                        else error = t["serverInvalid"]
                    },
                )
                if (error != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(error ?: "", color = p.danger, fontSize = 12.5.sp)
                }
                Spacer(Modifier.height(18.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlineButton(
                        text = t["cancel"],
                        onClick = onDismiss,
                        modifier = Modifier.weight(1f),
                    )
                    PrimaryButton(
                        text = t["serverSave"],
                        onClick = {
                            if (Prefs.isValidBaseUrl(value)) onSave(Prefs.normalizeBaseUrl(value))
                            else error = t["serverInvalid"]
                        },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
    }
}
