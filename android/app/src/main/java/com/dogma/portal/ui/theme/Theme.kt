package com.dogma.portal.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * Палитра desktop-клиента Dogma VPN:
 * чёрный сайдбар, светлый/тёмный контент, монохромный акцент.
 */
data class DogmaPalette(
    val bg: Color,
    val card: Color,
    val border: Color,
    val fg: Color,
    val muted: Color,
    val accent: Color,
    val accentFg: Color,
    val chipBg: Color,
    val track: Color,
    val danger: Color,
    val ok: Color,
    val warning: Color,
    val sideBg: Color,
    val sideFg: Color,
    val sideActiveBg: Color,
    val sideActiveFg: Color,
    val authBg: Color,
    val authCard: Color,
    val authBorder: Color,
    val authInput: Color,
    val authFg: Color,
    val authMuted: Color,
)

val LightPalette = DogmaPalette(
    bg = Color(0xFFF4F4F2),
    card = Color(0xFFFFFFFF),
    border = Color(0xFFE8E8E6),
    fg = Color(0xFF111111),
    muted = Color(0xFF8A8A8A),
    accent = Color(0xFF111111),
    accentFg = Color(0xFFFFFFFF),
    chipBg = Color(0xFFFAFAFA),
    track = Color(0xFFE5E5E3),
    danger = Color(0xFFD43A3A),
    ok = Color(0xFF111111),
    warning = Color(0xFFE6A817),
    sideBg = Color(0xFF0B0B0B),
    sideFg = Color(0xFF9A9A9A),
    sideActiveBg = Color(0xFF1E1E1E),
    sideActiveFg = Color(0xFFFFFFFF),
    authBg = Color(0xFF0B0B0B),
    authCard = Color(0xFF141414),
    authBorder = Color(0xFF242424),
    authInput = Color(0xFF1D1D1D),
    authFg = Color(0xFFEEEEEE),
    authMuted = Color(0xFF8F8F8F),
)

val DarkPalette = LightPalette.copy(
    bg = Color(0xFF131313),
    card = Color(0xFF1C1C1C),
    border = Color(0xFF2A2A2A),
    fg = Color(0xFFF2F2F2),
    muted = Color(0xFF8F8F8F),
    accent = Color(0xFFF2F2F2),
    accentFg = Color(0xFF111111),
    chipBg = Color(0xFF222222),
    track = Color(0xFF2C2C2C),
    ok = Color(0xFFF2F2F2),
)

val LocalPalette = staticCompositionLocalOf { LightPalette }

@Composable
fun dogmaPalette(): DogmaPalette = LocalPalette.current

@Composable
fun DogmaTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val palette = if (dark) DarkPalette else LightPalette
    CompositionLocalProvider(LocalPalette provides palette) {
        MaterialTheme(
            colorScheme = if (dark) {
                darkColorScheme(
                    primary = palette.accent,
                    onPrimary = palette.accentFg,
                    background = palette.bg,
                    onBackground = palette.fg,
                    surface = palette.card,
                    onSurface = palette.fg,
                    surfaceVariant = palette.chipBg,
                    onSurfaceVariant = palette.muted,
                    outline = palette.border,
                    error = palette.danger,
                    onError = Color.White,
                )
            } else {
                lightColorScheme(
                    primary = palette.accent,
                    onPrimary = palette.accentFg,
                    background = palette.bg,
                    onBackground = palette.fg,
                    surface = palette.card,
                    onSurface = palette.fg,
                    surfaceVariant = palette.chipBg,
                    onSurfaceVariant = palette.muted,
                    outline = palette.border,
                    error = palette.danger,
                    onError = Color.White,
                )
            },
            content = content,
        )
    }
}
