package com.dogma.portal.ui.auth

import android.annotation.SuppressLint
import android.webkit.CookieManager
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.dogma.portal.ui.Strings
import com.dogma.portal.ui.components.DogmaIcon
import com.dogma.portal.ui.components.DogmaIconKind
import com.dogma.portal.ui.theme.dogmaPalette

/**
 * SSO (OIDC/Google) внутри WebView. После редиректа забираем cookie
 * dogma.sid из CookieManager и переносим в OkHttp-сессию приложения.
 *
 * Google не любит встроенные браузеры, поэтому подставляем обычный
 * мобильный Chrome UA (без метки wv) и включаем сторонние cookie.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun SsoDialog(
    startUrl: String,
    baseUrl: String,
    t: Strings,
    onCookie: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val p = dogmaPalette()
    val cookieManager = remember { CookieManager.getInstance() }
    val chromeUa = "Mozilla/5.0 (Linux; Android 14; Pixel 6) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Column(Modifier.fillMaxSize().background(p.bg)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = t["ssoTitle"],
                    fontFamily = com.dogma.portal.ui.theme.Inter,
                    fontWeight = FontWeight.Medium,
                    fontSize = 17.sp,
                    color = p.fg,
                    modifier = Modifier.weight(1f),
                )
                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .clickable(onClick = onDismiss),
                    contentAlignment = Alignment.Center,
                ) {
                    DogmaIcon(DogmaIconKind.CLOSE, Modifier.size(19.dp), tint = p.muted)
                }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(p.border))
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { context ->
                    var captured = false
                    WebView(context).apply {
                        settings.javaScriptEnabled = true
                        settings.domStorageEnabled = true
                        settings.databaseEnabled = true
                        settings.userAgentString = chromeUa
                        cookieManager.setAcceptCookie(true)
                        cookieManager.setAcceptThirdPartyCookies(this, true)
                        webViewClient = object : WebViewClient() {
                            override fun onPageFinished(view: WebView, url: String) {
                                if (captured) return
                                val lower = url.lowercase()
                                // /auth/login создаёт сессию OIDC ещё до входа,
                                // /auth/callback — промежуточный шаг. Ждём возврат
                                // на страницу портала после успешной аутентификации.
                                if (lower.contains("accounts.google.com") ||
                                    lower.contains("/auth/login") ||
                                    lower.contains("/auth/callback")
                                ) {
                                    return
                                }
                                val header = cookieManager.getCookie(baseUrl)
                                    ?: cookieManager.getCookie(url)
                                    ?: return
                                if (header.contains("dogma.sid=")) {
                                    captured = true
                                    onCookie(header)
                                }
                            }
                        }
                        loadUrl(startUrl)
                    }
                },
            )
        }
    }
}
