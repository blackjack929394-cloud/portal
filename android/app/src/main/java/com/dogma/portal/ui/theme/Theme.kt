package com.dogma.portal.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.dogma.portal.R

val Inter = FontFamily(
    Font(R.font.inter_regular, FontWeight.Normal),
    Font(R.font.inter_medium, FontWeight.Medium),
    Font(R.font.inter_semibold, FontWeight.SemiBold),
)

val Mono = FontFamily(
    Font(R.font.jetbrains_mono_medium, FontWeight.Medium),
)

val DogmaTypography = Typography(
    titleLarge = TextStyle(
        fontFamily = Inter,
        fontWeight = FontWeight.Medium,
        fontSize = 26.sp,
        lineHeight = 31.sp,
    ),
    titleMedium = TextStyle(
        fontFamily = Inter,
        fontWeight = FontWeight.Medium,
        fontSize = 17.sp,
        lineHeight = 22.sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = Inter,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 22.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = Inter,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = Inter,
        fontWeight = FontWeight.Medium,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = Inter,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 18.sp,
    ),
)

/**
 * Палитра веб-портала DOGMA: тёплый тёмный фон, кремовый текст,
 * золотой акцент. Приложение использует её как единственную тему.
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

val PortalPalette = DogmaPalette(
    bg = Color(0xFF131210),
    card = Color(0xFF1B1917),
    border = Color(0x17EFE9DE),
    fg = Color(0xFFEFE9DE),
    muted = Color(0xFFAAA398),
    accent = Color(0xFFEFE9DE),
    accentFg = Color(0xFF14120F),
    chipBg = Color(0xFF131210),
    track = Color(0xFF24211E),
    danger = Color(0xFFD9776E),
    ok = Color(0xFF63B184),
    warning = Color(0xFFD8A13C),
    sideBg = Color(0xFF131210),
    sideFg = Color(0xFF8A847A),
    sideActiveBg = Color(0xFF24211E),
    sideActiveFg = Color(0xFFD8A13C),
    authBg = Color(0xFF131210),
    authCard = Color(0xFF1B1917),
    authBorder = Color(0x17EFE9DE),
    authInput = Color(0xFF131210),
    authFg = Color(0xFFEFE9DE),
    authMuted = Color(0xFFAAA398),
)

val LocalPalette = staticCompositionLocalOf { PortalPalette }

@Composable
fun dogmaPalette(): DogmaPalette = LocalPalette.current

@Composable
fun DogmaTheme(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalPalette provides PortalPalette) {
        MaterialTheme(
            colorScheme = darkColorScheme(
                primary = PortalPalette.accent,
                onPrimary = PortalPalette.accentFg,
                secondary = PortalPalette.warning,
                onSecondary = PortalPalette.accentFg,
                background = PortalPalette.bg,
                onBackground = PortalPalette.fg,
                surface = PortalPalette.card,
                onSurface = PortalPalette.fg,
                surfaceVariant = PortalPalette.track,
                onSurfaceVariant = PortalPalette.muted,
                outline = PortalPalette.border,
                error = PortalPalette.danger,
                onError = Color(0xFF14120F),
            ),
            typography = DogmaTypography,
            content = content,
        )
    }
}
