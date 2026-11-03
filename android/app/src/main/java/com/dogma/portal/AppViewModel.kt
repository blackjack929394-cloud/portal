package com.dogma.portal

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.dogma.portal.data.ApiException
import com.dogma.portal.data.AppSettings
import com.dogma.portal.data.ChatMessage
import com.dogma.portal.data.NetworkException
import com.dogma.portal.data.PortalRepository
import com.dogma.portal.data.Prefs
import com.dogma.portal.data.ProxyNode
import com.dogma.portal.data.SpeedPoint
import com.dogma.portal.data.StatsData
import com.dogma.portal.data.Subscription
import com.dogma.portal.data.ThemeMode
import com.dogma.portal.data.User
import com.dogma.portal.stats.StatsStore
import com.dogma.portal.ui.Lang
import com.dogma.portal.ui.Strings
import com.dogma.portal.vpn.NodeParser
import com.dogma.portal.vpn.VpnManager
import com.dogma.portal.vpn.VpnRuntime
import com.dogma.portal.vpn.VpnState
import com.dogma.portal.vpn.VpnStatus
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.update
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.InetAddress
import java.util.concurrent.TimeUnit
import kotlin.math.max

data class ChatUi(
    val open: Boolean = false,
    val messages: List<ChatMessage> = emptyList(),
    val unread: Int = 0,
    val sending: Boolean = false,
    val error: String? = null,
)

data class AppState(
    val booting: Boolean = true,
    val bootError: Boolean = false,
    val sso: Boolean = false,
    val user: User? = null,
    val authBusy: Boolean = false,
    val authError: String? = null,
    val subscription: Subscription? = null,
    val subLoading: Boolean = false,
    val subError: String? = null,
    val nodes: List<ProxyNode> = emptyList(),
    val nodesLoading: Boolean = false,
    val nodesError: String? = null,
    val selected: ProxyNode? = null,
    val settings: AppSettings = AppSettings(),
    val baseUrl: String = "",
    val lang: Lang = Lang.RU,
    val stats: StatsData = StatsData(),
    val pings: Map<String, Int?> = emptyMap(),
    val externalIp: String? = null,
    val speedHistory: List<SpeedPoint> = emptyList(),
    val chat: ChatUi = ChatUi(),
    val requestBusy: Boolean = false,
) {
    val subStatus: String get() = subscription?.status ?: "none"
    val hasToken: Boolean get() = !subscription?.token.isNullOrBlank()
    val canConnect: Boolean get() = hasToken && selected != null
}

class AppViewModel(app: Application) : AndroidViewModel(app) {

    private val application = app
    private val prefs = Prefs(app)
    private val repo = PortalRepository(prefs)
    private val statsStore = StatsStore(app)

    private val _state = MutableStateFlow(
        AppState(
            settings = prefs.settings(),
            baseUrl = prefs.baseUrl,
            lang = Lang.from(prefs.lang),
            stats = statsStore.load(),
        ),
    )
    val state: StateFlow<AppState> = _state.asStateFlow()

    private val ipClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(8, TimeUnit.SECONDS)
        .build()

    private var ipSince = 0L
    private var ipJob: Job? = null
    private var lastVpnState = VpnState.DISCONNECTED

    init {
        bootstrap()
        pollUnread()
        pollPending()
        observeVpn()
    }

    // ── boot / auth ──────────────────────────────────────────────────────────

    fun bootstrap() {
        viewModelScope.launch {
            _state.update {
                it.copy(
                    booting = true,
                    bootError = false,
                    authError = null,
                    settings = prefs.settings(),
                    baseUrl = prefs.baseUrl,
                    lang = Lang.from(prefs.lang),
                )
            }
            try {
                val config = runCatching { repo.authConfig() }.getOrDefault(com.dogma.portal.data.AuthConfig())
                val user = repo.me()
                if (user == null) {
                    _state.update {
                        it.copy(
                            booting = false,
                            user = null,
                            sso = config.sso,
                        )
                    }
                } else {
                    prefs.userName = user.name
                    prefs.userEmail = user.email
                    _state.update {
                        it.copy(
                            booting = false,
                            user = user,
                            sso = config.sso,
                        )
                    }
                    loadSubscription()
                    refreshUnread()
                }
            } catch (_: Throwable) {
                _state.update { it.copy(booting = false, bootError = true) }
            }
        }
    }

    fun login(username: String, password: String) {
        viewModelScope.launch {
            _state.update { it.copy(authBusy = true, authError = null, bootError = false) }
            try {
                val user = repo.login(username.trim(), password)
                onAuthed(user)
            } catch (e: Throwable) {
                _state.update {
                    it.copy(authBusy = false, authError = authErrorText(e, Strings(it.lang)))
                }
            }
        }
    }

    fun register(fullName: String, email: String, username: String, password: String) {
        viewModelScope.launch {
            _state.update { it.copy(authBusy = true, authError = null, bootError = false) }
            try {
                val user = repo.register(
                    fullName = fullName.trim(),
                    email = email.trim(),
                    username = username.trim(),
                    password = password,
                )
                onAuthed(user)
            } catch (e: Throwable) {
                _state.update {
                    it.copy(authBusy = false, authError = authErrorText(e, Strings(it.lang)))
                }
            }
        }
    }

    private suspend fun onAuthed(user: User) {
        prefs.userName = user.name
        prefs.userEmail = user.email
        _state.update {
            it.copy(
                user = user,
                authBusy = false,
                authError = null,
                bootError = false,
                booting = false,
            )
        }
        loadSubscription()
        refreshUnread()
    }

    fun logout() {
        viewModelScope.launch {
            runCatching { VpnManager.stop(application) }
            runCatching { repo.logout() }
            prefs.clearSession()
            VpnRuntime.setDisconnected()
            val settings = prefs.settings()
            val lang = Lang.from(prefs.lang)
            val sso = _state.value.sso
            _state.value = AppState(
                booting = false,
                sso = sso,
                settings = settings,
                baseUrl = prefs.baseUrl,
                lang = lang,
                stats = statsStore.load(),
            )
        }
    }

    fun clearAuthError() {
        _state.update { it.copy(authError = null) }
    }

    /** Завершает вход после SSO: переносит cookie из WebView и проверяет сессию. */
    fun applySsoCookie(header: String) {
        viewModelScope.launch {
            _state.update { it.copy(authBusy = true, authError = null) }
            repo.setSessionCookie(header)
            val user = runCatching { repo.me() }.getOrNull()
            if (user == null) {
                _state.update {
                    it.copy(authBusy = false, authError = Strings(it.lang)["ssoFailed"])
                }
            } else {
                onAuthed(user)
            }
        }
    }

    fun updateBaseUrl(raw: String) {
        if (!Prefs.isValidBaseUrl(raw)) return
        runCatching { VpnManager.stop(application) }
        repo.clearSession()
        prefs.baseUrl = raw
        prefs.clearSession()
        _state.value = AppState(
            booting = true,
            settings = prefs.settings(),
            baseUrl = prefs.baseUrl,
            lang = Lang.from(prefs.lang),
            stats = statsStore.load(),
        )
        bootstrap()
    }

    // ── subscription / nodes ─────────────────────────────────────────────────

    private suspend fun loadSubscription(quiet: Boolean = false) {
        if (!quiet) _state.update { it.copy(subLoading = true, subError = null) }
        try {
            val sub = repo.subscription()
            when {
                sub == null -> _state.update {
                    it.copy(
                        subLoading = false,
                        subError = null,
                        subscription = Subscription(status = "none"),
                        nodes = emptyList(),
                        nodesError = null,
                        selected = null,
                    )
                }
                sub.status == "pending" || sub.status == "denied" -> _state.update {
                    it.copy(
                        subLoading = false,
                        subscription = sub,
                        nodes = emptyList(),
                        selected = null,
                    )
                }
                else -> {
                    _state.update { it.copy(subLoading = false, subscription = sub, subError = null) }
                    if (!sub.token.isNullOrBlank()) loadNodes(sub.token)
                }
            }
        } catch (e: Throwable) {
            if (e is ApiException && e.status == 401) {
                forceLogout()
            } else {
                _state.update {
                    it.copy(
                        subLoading = false,
                        subError = errorText(e, Strings(it.lang)),
                    )
                }
            }
        }
    }

    fun refreshSubscription() {
        viewModelScope.launch { loadSubscription() }
    }

    private suspend fun loadNodes(token: String) {
        _state.update { it.copy(nodesLoading = true, nodesError = null, pings = emptyMap()) }
        val text = try {
            repo.subscriptionText(token, "links")
        } catch (e: Throwable) {
            _state.update {
                it.copy(
                    nodesLoading = false,
                    nodesError = errorText(e, Strings(it.lang)),
                )
            }
            return
        }
        val nodes = text?.let(NodeParser::parseLines).orEmpty()
        val smart = runCatching { repo.smartSubscription(token) }.getOrNull()
        prefs.smartConfig = smart?.takeIf { it.isNotBlank() }
        val previous = _state.value.selected
        val last = prefs.lastServer
        val selected = previous?.let { old -> nodes.find { it.name == old.name } }
            ?: last?.let { name -> nodes.find { it.name == name } }
            ?: nodes.firstOrNull()
        if (selected != null) {
            prefs.selectedNodeRaw = selected.raw
            prefs.lastServer = selected.name
        }
        _state.update {
            it.copy(
                nodesLoading = false,
                nodes = nodes,
                selected = selected,
                nodesError = if (nodes.isEmpty()) Strings(it.lang)["errorNoNodes"] else null,
            )
        }
        if (nodes.isNotEmpty()) pingAll()
    }

    fun requestAccess() {
        if (_state.value.requestBusy) return
        viewModelScope.launch {
            _state.update { it.copy(requestBusy = true, subError = null) }
            try {
                val sub = repo.createSubscription()
                if (sub.status == "pending") {
                    _state.update {
                        it.copy(
                            requestBusy = false,
                            subscription = sub,
                            nodes = emptyList(),
                            selected = null,
                        )
                    }
                } else {
                    _state.update { it.copy(requestBusy = false) }
                    loadSubscription()
                }
            } catch (e: Throwable) {
                _state.update {
                    it.copy(
                        requestBusy = false,
                        subError = errorText(e, Strings(it.lang)),
                    )
                }
            }
        }
    }

    fun selectNode(node: ProxyNode) {
        prefs.selectedNodeRaw = node.raw
        prefs.lastServer = node.name
        _state.update { it.copy(selected = node) }
    }

    fun toggleFavorite(name: String) {
        val next = prefs.favorites.toMutableSet()
        if (!next.add(name)) next.remove(name)
        prefs.favorites = next
        _state.update { it.copy(settings = it.settings.copy(favorites = next)) }
    }

    fun pingAll() {
        val nodes = _state.value.nodes
        if (nodes.isEmpty()) return
        _state.update { it.copy(pings = emptyMap()) }
        nodes.forEach { node ->
            viewModelScope.launch {
                val ms = withContext(Dispatchers.IO) { pingHost(node.host) }
                _state.update { it.copy(pings = it.pings + (node.host to ms)) }
            }
        }
    }

    private fun pingHost(host: String): Int? = runCatching {
        val address = InetAddress.getByName(host)
        val start = System.nanoTime()
        val reachable = address.isReachable(2000)
        if (!reachable) return@runCatching null
        ((System.nanoTime() - start) / 1_000_000L).toInt().coerceAtLeast(1)
    }.getOrNull()

    // ── settings ─────────────────────────────────────────────────────────────

    fun setLang(lang: Lang) {
        prefs.lang = lang.code
        _state.update { it.copy(lang = lang) }
    }

    fun setTheme(mode: ThemeMode) {
        prefs.theme = when (mode) {
            ThemeMode.DARK -> "dark"
            ThemeMode.LIGHT -> "light"
            ThemeMode.SYSTEM -> "system"
        }
        _state.update { it.copy(settings = it.settings.copy(theme = mode)) }
    }

    fun cycleTheme() {
        val next = when (_state.value.settings.theme) {
            ThemeMode.SYSTEM -> ThemeMode.DARK
            ThemeMode.DARK -> ThemeMode.LIGHT
            ThemeMode.LIGHT -> ThemeMode.SYSTEM
        }
        setTheme(next)
    }

    fun setKillSwitch(value: Boolean) {
        prefs.killSwitch = value
        _state.update { it.copy(settings = it.settings.copy(killSwitch = value)) }
    }

    fun setAutostart(value: Boolean) {
        prefs.autostart = value
        _state.update { it.copy(settings = it.settings.copy(autostart = value)) }
    }

    fun setLeakProtection(value: Boolean) {
        prefs.leakProtection = value
        _state.update { it.copy(settings = it.settings.copy(leakProtection = value)) }
    }

    fun setDns(value: String) {
        prefs.dns = value
        _state.update { it.copy(settings = it.settings.copy(dns = value)) }
    }

    fun setSplitTunneling(value: String) {
        prefs.splitTunneling = value
        _state.update { it.copy(settings = it.settings.copy(splitTunneling = value)) }
    }

    // ── VPN ──────────────────────────────────────────────────────────────────

    fun startVpn() {
        val node = _state.value.selected
        if (node == null) {
            VpnRuntime.setError(Strings(_state.value.lang)["errorNoServer"])
            return
        }
        prefs.selectedNodeRaw = node.raw
        prefs.lastServer = node.name
        viewModelScope.launch {
            val token = _state.value.subscription?.token
            if (!token.isNullOrBlank()) {
                runCatching { repo.smartSubscription(token) }
                    .getOrNull()
                    ?.takeIf { it.isNotBlank() }
                    ?.let { prefs.smartConfig = it }
            }
            runCatching { VpnManager.start(application) }
                .onFailure { VpnRuntime.setError(it.message ?: "VPN start failed") }
        }
    }

    fun stopVpn() {
        runCatching { VpnManager.stop(application) }
    }

    fun onVpnPermissionDenied() {
        VpnRuntime.setError(Strings(_state.value.lang)["errorNoPermission"])
    }

    private fun observeVpn() {
        viewModelScope.launch {
            VpnRuntime.status.collect { vpn ->
                updateVpnDerived(vpn)
                if (vpn.state == VpnState.CONNECTED && lastVpnState != VpnState.CONNECTED) {
                    pingAll()
                }
                lastVpnState = vpn.state
                if (vpn.state == VpnState.CONNECTED && vpn.connectedSince != ipSince) {
                    ipSince = vpn.connectedSince
                    fetchExternalIp()
                }
                if (vpn.state != VpnState.CONNECTED) ipSince = 0L
            }
        }
    }

    private fun updateVpnDerived(vpn: VpnStatus) {
        _state.update { current ->
            val history = when (vpn.state) {
                VpnState.CONNECTED -> (current.speedHistory + SpeedPoint(vpn.rxSpeed, vpn.txSpeed)).takeLast(60)
                VpnState.DISCONNECTED, VpnState.ERROR -> emptyList()
                VpnState.CONNECTING -> emptyList()
            }
            current.copy(
                speedHistory = history,
                externalIp = if (vpn.state == VpnState.CONNECTED) current.externalIp else null,
            )
        }
    }

    private fun fetchExternalIp() {
        ipJob?.cancel()
        ipJob = viewModelScope.launch {
            _state.update { it.copy(externalIp = null) }
            var result: String?
            repeat(3) { attempt ->
                if (attempt > 0) delay(2_000)
                result = withContext(Dispatchers.IO) {
                    runCatching {
                        val request = Request.Builder()
                            .url("https://api.ipify.org?format=json")
                            .build()
                        ipClient.newCall(request).execute().use { response ->
                            val body = response.body?.string().orEmpty()
                            Json.parseToJsonElement(body).jsonObject["ip"]?.jsonPrimitive?.contentOrNull
                        }
                    }.getOrNull()
                }
                if (result != null) {
                    _state.update { it.copy(externalIp = result) }
                    return@launch
                }
            }
            _state.update { it.copy(externalIp = null) }
        }
    }

    // ── stats ────────────────────────────────────────────────────────────────

    fun refreshStats() {
        _state.update { it.copy(stats = statsStore.load()) }
    }

    // ── chat ─────────────────────────────────────────────────────────────────

    fun openChat() {
        _state.update { it.copy(chat = it.chat.copy(open = true, unread = 0, error = null)) }
        refreshChat()
    }

    fun closeChat() {
        _state.update { it.copy(chat = it.chat.copy(open = false)) }
        refreshUnread()
    }

    fun refreshChat() {
        if (_state.value.user == null) return
        viewModelScope.launch {
            try {
                val messages = repo.chat()
                _state.update {
                    it.copy(chat = it.chat.copy(messages = messages, unread = 0, error = null))
                }
            } catch (_: Throwable) {
                // тихо: чат обновится при следующем poll
            }
        }
    }

    fun sendChat(text: String) {
        val value = text.trim()
        if (value.isEmpty()) return
        viewModelScope.launch {
            _state.update { it.copy(chat = it.chat.copy(sending = true, error = null)) }
            try {
                val message = repo.sendChat(value)
                _state.update {
                    it.copy(
                        chat = it.chat.copy(
                            messages = it.chat.messages + message,
                            sending = false,
                        ),
                    )
                }
            } catch (e: Throwable) {
                _state.update {
                    it.copy(
                        chat = it.chat.copy(
                            sending = false,
                            error = errorText(e, Strings(it.lang)),
                        ),
                    )
                }
            }
        }
    }

    private fun refreshUnread() {
        if (_state.value.user == null) return
        viewModelScope.launch {
            val unread = repo.unread()
            _state.update { it.copy(chat = it.chat.copy(unread = unread)) }
        }
    }

    private fun pollUnread() {
        viewModelScope.launch {
            while (isActive) {
                val current = _state.value
                if (current.user != null && !current.chat.open) {
                    val unread = repo.unread()
                    _state.update { it.copy(chat = it.chat.copy(unread = unread)) }
                }
                delay(15_000)
            }
        }
    }

    private fun pollPending() {
        viewModelScope.launch {
            while (isActive) {
                delay(20_000)
                val current = _state.value
                if (current.user != null &&
                    (current.subStatus == "pending" || current.subStatus == "denied")
                ) {
                    loadSubscription(quiet = true)
                }
            }
        }
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private fun forceLogout() {
        runCatching { VpnManager.stop(application) }
        prefs.clearSession()
        VpnRuntime.setDisconnected()
        _state.value = AppState(
            booting = false,
            sso = _state.value.sso,
            settings = prefs.settings(),
            baseUrl = prefs.baseUrl,
            lang = Lang.from(prefs.lang),
            stats = statsStore.load(),
            authError = Strings(_state.value.lang)["errUnauthorized"],
        )
    }

    private fun authErrorText(e: Throwable, s: Strings): String = when (e) {
        is ApiException -> when (e.code) {
            "USERNAME_TAKEN" -> s["errUsernameTaken"]
            "EMAIL_TAKEN" -> s["errEmailTaken"]
            "INVALID_CREDENTIALS" -> s["errInvalidCreds"]
            "ACCOUNT_BLOCKED" -> s["errBlocked"]
            "VALIDATION_ERROR" -> s["errValidation"]
            else -> e.details ?: e.message
        }
        is NetworkException -> s["errNetwork"]
        else -> e.message ?: s["errGeneric"]
    }

    private fun errorText(e: Throwable, s: Strings): String = when (e) {
        is ApiException -> when (e.code) {
            "UNAUTHENTICATED" -> s["errUnauthorized"]
            "NO_NODES_AVAILABLE" -> s["errorNoNodes"]
            else -> e.details ?: e.message
        }
        is NetworkException -> s["errNetwork"]
        else -> e.message ?: s["errGeneric"]
    }
}
