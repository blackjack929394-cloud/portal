package com.dogma.portal

import android.app.Activity
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import androidx.core.content.ContextCompat
import androidx.activity.viewModels
import com.dogma.portal.ui.MainScreen
import com.dogma.portal.ui.Strings
import com.dogma.portal.ui.Tab
import com.dogma.portal.ui.auth.AuthScreen
import com.dogma.portal.ui.auth.SsoDialog
import com.dogma.portal.ui.chat.ChatScreen
import com.dogma.portal.ui.components.DogmaTopBar
import com.dogma.portal.ui.components.ServerDialog
import com.dogma.portal.ui.qr.QrLoginScreen
import com.dogma.portal.ui.routing.RoutingScreen
import com.dogma.portal.ui.theme.DogmaTheme
import com.dogma.portal.ui.theme.dogmaPalette
import com.dogma.portal.vpn.VpnManager
import com.dogma.portal.vpn.VpnRuntime

class MainActivity : ComponentActivity() {
    private val appVm: AppViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handleDeepLink(intent)
        setContent {
            DogmaRoot(vm = appVm)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    private fun handleDeepLink(intent: Intent?) {
        val data = intent?.dataString ?: return
        if (intent.data != null) appVm.handleDeepLink(data)
    }
}

@Composable
private fun DogmaRoot(vm: AppViewModel) {
    val state by vm.state.collectAsState()
    val vpn by VpnRuntime.status.collectAsState()
    val t = remember(state.lang) { Strings(state.lang) }

    DogmaTheme {
        RootContent(vm = vm, state = state, vpn = vpn, t = t)
    }
}

@Composable
private fun RootContent(
    vm: AppViewModel,
    state: AppState,
    vpn: com.dogma.portal.vpn.VpnStatus,
    t: Strings,
) {
    val p = dogmaPalette()
    val context = LocalContext.current
    val view = LocalView.current
    var tab by rememberSaveable { mutableStateOf(Tab.HOME) }
    var showServer by rememberSaveable { mutableStateOf(false) }
    var showSso by rememberSaveable { mutableStateOf(false) }
    var showRouting by rememberSaveable { mutableStateOf(false) }

    SideEffect {
        val window = (context as? Activity)?.window ?: return@SideEffect
        window.statusBarColor = p.bg.toArgb()
        window.navigationBarColor = p.bg.toArgb()
        val controller = WindowCompat.getInsetsController(window, view)
        controller.isAppearanceLightStatusBars = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            controller.isAppearanceLightNavigationBars = false
        }
    }

    val vpnLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) vm.startVpn() else vm.onVpnPermissionDenied()
    }
    val notificationLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { }
    LaunchedEffect(state.user != null) {
        if (state.user != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            notificationLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
    val connect: () -> Unit = {
        val intent = VpnManager.prepareIntent(context)
        if (intent == null) vm.startVpn() else vpnLauncher.launch(intent)
    }

    BackHandler(enabled = state.qr.open) { vm.closeQr() }
    BackHandler(enabled = !state.qr.open && showRouting) { showRouting = false }
    BackHandler(enabled = state.chat.open) { vm.closeChat() }
    BackHandler(enabled = !state.qr.open && !showRouting && !state.chat.open && tab != Tab.HOME) {
        tab = Tab.HOME
    }

    Box(Modifier.fillMaxSize().background(p.bg)) {
        Column(Modifier.fillMaxSize()) {
            DogmaTopBar(
                lang = state.lang,
                tagline = t["brandTag"],
                onLang = vm::setLang,
                userInitial = state.user?.let {
                    (it.name ?: it.email)?.firstOrNull { c -> c.isLetterOrDigit() }?.uppercase()
                },
                profileLabel = t["tabProfile"],
                onProfile = { tab = Tab.PROFILE },
            )
            Box(Modifier.weight(1f).fillMaxSize()) {
                if (state.user == null) {
                    AuthScreen(
                        state = state,
                        t = t,
                        onLogin = vm::login,
                        onRegister = vm::register,
                        onRetry = vm::bootstrap,
                        onClearError = vm::clearAuthError,
                        onSso = { showSso = true },
                        onQr = vm::openQr,
                    )
                } else {
                    MainScreen(
                        state = state,
                        vpn = vpn,
                        t = t,
                        tab = tab,
                        onTab = { tab = it },
                        onConnect = connect,
                        onDisconnect = vm::stopVpn,
                        onOpenChat = vm::openChat,
                        onRequestAccess = vm::requestAccess,
                        onSelectNode = { node ->
                            vm.selectNode(node)
                            tab = Tab.HOME
                        },
                        onToggleFavorite = vm::toggleFavorite,
                        onRefreshSubscription = vm::refreshSubscription,
                        onPing = vm::pingAll,
                        onKillSwitch = vm::setKillSwitch,
                        onAutostart = vm::setAutostart,
                        onLogout = vm::logout,
                        onRefreshStats = vm::refreshStats,
                        onOpenRouting = {
                            showRouting = true
                            vm.loadRouting()
                        },
                        onOpenServer = { showServer = true },
                    )
                }
            }
        }

        if (state.chat.open) {
            ChatScreen(
                chat = state.chat,
                t = t,
                onClose = vm::closeChat,
                onRefresh = vm::refreshChat,
                onSend = vm::sendChat,
            )
        }

        if (state.qr.open) {
            QrLoginScreen(
                qr = state.qr,
                t = t,
                onClose = vm::closeQr,
                onSubmitCode = vm::submitQrCode,
            )
        }

        if (showRouting) {
            RoutingScreen(
                state = state.routing,
                t = t,
                onBack = { showRouting = false },
                onSave = vm::saveRouting,
            )
        }
    }

    if (showServer) {
        ServerDialog(
            current = state.baseUrl,
            t = t,
            onDismiss = { showServer = false },
            onSave = { url ->
                showServer = false
                vm.updateBaseUrl(url)
            },
        )
    }

    if (showSso) {
        SsoDialog(
            startUrl = state.baseUrl + "/auth/login",
            baseUrl = state.baseUrl,
            t = t,
            onCookie = { header ->
                showSso = false
                vm.applySsoCookie(header)
            },
            onDismiss = { showSso = false },
        )
    }
}
