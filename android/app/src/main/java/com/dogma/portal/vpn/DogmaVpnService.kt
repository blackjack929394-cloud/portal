package com.dogma.portal.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.TrafficStats
import android.net.VpnService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import com.dogma.portal.DogmaApp
import com.dogma.portal.MainActivity
import com.dogma.portal.R
import com.dogma.portal.data.Prefs
import com.dogma.portal.stats.StatsStore
import io.nekohasekai.libbox.CommandServer
import io.nekohasekai.libbox.CommandServerHandler
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.OverrideOptions
import io.nekohasekai.libbox.SystemProxyStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference

/**
 * Foreground VpnService, внутри которого работает sing-box (libbox)
 * с hysteria2-outbound. Управление — через [VpnRuntime].
 */
class DogmaVpnService : VpnService(), CommandServerHandler {

    private val prefs by lazy { Prefs(this) }
    private val statsStore by lazy { StatsStore(this) }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val started = AtomicBoolean(false)
    private val tunRef = AtomicReference<ParcelFileDescriptor?>(null)
    private var commandServer: CommandServer? = null
    private var platform: DogmaPlatformInterface? = null
    private var trafficJob: Job? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopVpn()
                return START_NOT_STICKY
            }
            ACTION_START -> startVpn()
            null -> if (started.get()) startVpn()
        }
        return START_STICKY
    }

    private fun startVpn() {
        if (!started.compareAndSet(false, true)) return

        val node = prefs.selectedNodeRaw?.let(NodeParser::parse)
        if (node == null) {
            VpnRuntime.setError("Сервер не выбран")
            stopVpn(keepError = true)
            return
        }

        startForegroundNotification(node.name)
        VpnRuntime.setConnecting(node)

        scope.launch {
            try {
                val settings = prefs.settings()
                val smart = prefs.smartConfig
                val config = if (!smart.isNullOrBlank()) {
                    Log.i(TAG, "using portal smart config")
                    SmartConfig.prepare(smart, node.name, settings)
                } else {
                    Log.i(TAG, "using fallback node config")
                    SingBoxConfig.build(node, settings)
                }
                Libbox.checkConfig(config)

                val platformInterface = DogmaPlatformInterface(this@DogmaVpnService)
                platform = platformInterface
                DefaultNetworkMonitor.start(this@DogmaVpnService)

                val server = CommandServer(this@DogmaVpnService, platformInterface)
                commandServer = server
                server.start()
                server.startOrReloadService(
                    config,
                    OverrideOptions().apply {
                        // Пустые include/exclude: весь трафик устройства,
                        // включая сам клиент, идёт через туннель.
                    },
                )

                val since = System.currentTimeMillis()
                VpnRuntime.setConnected(node, since)
                startTrafficLoop(node.name)
                Log.i(TAG, "connected to ${node.name} (${node.hostPort})")
            } catch (t: Throwable) {
                Log.e(TAG, "startVpn failed", t)
                VpnRuntime.setError(vpnErrorText(t))
                stopVpn(keepError = true)
            }
        }
    }

    private fun startTrafficLoop(serverName: String) {
        trafficJob?.cancel()
        trafficJob = scope.launch {
            var lastRx = safeTotalRx()
            var lastTx = safeTotalTx()
            var baseRx = lastRx
            var baseTx = lastTx
            var lastAt = SystemClock.elapsedRealtime()
            while (isActive) {
                delay(1_000)
                val rx = safeTotalRx()
                val tx = safeTotalTx()
                val now = SystemClock.elapsedRealtime()
                val dt = ((now - lastAt).coerceAtLeast(1)).toDouble() / 1000.0
                val dRx = (rx - lastRx).coerceAtLeast(0)
                val dTx = (tx - lastTx).coerceAtLeast(0)
                VpnRuntime.updateTraffic(
                    rx = (rx - baseRx).coerceAtLeast(0),
                    tx = (tx - baseTx).coerceAtLeast(0),
                    rxSpeed = dRx / dt,
                    txSpeed = dTx / dt,
                )
                statsStore.addTraffic(dRx, dTx, dt, serverName)
                lastRx = rx
                lastTx = tx
                lastAt = now
                if (VpnRuntime.status.value.state != VpnState.CONNECTED) break
            }
        }
    }

    private fun safeTotalRx(): Long = TrafficStats.getTotalRxBytes().coerceAtLeast(0L)
    private fun safeTotalTx(): Long = TrafficStats.getTotalTxBytes().coerceAtLeast(0L)

    /** Создаёт Builder, чтобы libbox мог открыть TUN через VpnService. */
    fun newVpnBuilder(mtu: Int): Builder {
        val intent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = Builder()
            .setSession("Dogma VPN")
            .setMtu(if (mtu > 0) mtu else 1500)
            .setConfigureIntent(intent)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            builder.setMetered(false)
        }
        return builder
    }

    fun attachTun(pfd: ParcelFileDescriptor) {
        tunRef.getAndSet(pfd)?.let { runCatching { it.close() } }
    }

    private fun startForegroundNotification(nodeName: String) {
        val open = PendingIntent.getActivity(
            this,
            1,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification: Notification = NotificationCompat.Builder(this, DogmaApp.VPN_CHANNEL_ID)
            .setContentTitle("Dogma VPN")
            .setContentText("Подключение: $nodeName")
            .setSmallIcon(R.drawable.ic_stat_vpn)
            .setContentIntent(open)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        startForeground(NOTIFICATION_ID, notification)
    }

    private fun stopVpn(keepError: Boolean = false) {
        try {
            trafficJob?.cancel()
            trafficJob = null
            runCatching { commandServer?.closeService() }
            runCatching { commandServer?.close() }
            commandServer = null
            platform = null
            runCatching { tunRef.getAndSet(null)?.close() }
            DefaultNetworkMonitor.stop()
        } catch (t: Throwable) {
            Log.w(TAG, "stopVpn cleanup", t)
        }
        started.set(false)
        if (!keepError) VpnRuntime.setDisconnected()
        runCatching { stopForeground(STOP_FOREGROUND_REMOVE) }
        stopSelf()
    }

    override fun onRevoke() {
        stopVpn()
        super.onRevoke()
    }

    override fun onDestroy() {
        if (started.get()) stopVpn()
        scope.cancel()
        super.onDestroy()
    }

    private fun vpnErrorText(t: Throwable): String {
        val raw = t.message?.takeIf { it.isNotBlank() } ?: t.javaClass.simpleName
        return when {
            raw.contains("decode config", true) || raw.contains("initialize inbound", true) ->
                "Ошибка конфигурации VPN. Выберите другой сервер или обновите подписку."
            raw.contains("timeout", true) || raw.contains("i/o", true) || raw.contains("handshake", true) ->
                "Сервер не отвечает. Проверьте интернет или выберите другой сервер."
            raw.contains("permission", true) ->
                "Нет разрешения VPN. Разрешите подключение и попробуйте снова."
            else -> raw
        }
    }

    // ── CommandServerHandler ────────────────────────────────────────────────

    override fun serviceStop() {
        Handler(Looper.getMainLooper()).post { stopVpn() }
    }

    override fun serviceReload() = Unit

    override fun getSystemProxyStatus(): SystemProxyStatus = SystemProxyStatus().apply {
        available = false
        enabled = false
    }

    override fun setSystemProxyEnabled(enabled: Boolean) = Unit

    override fun connectSSHAgent(): Int = error("SSH agent is not supported")

    override fun triggerNativeCrash() = Unit

    override fun writeDebugMessage(message: String?) {
        if (message != null) Log.d(TAG, message)
    }

    companion object {
        private const val TAG = "DogmaVpnService"
        private const val NOTIFICATION_ID = 4201

        const val ACTION_START = "com.dogma.portal.vpn.START"
        const val ACTION_STOP = "com.dogma.portal.vpn.STOP"

        fun channel(context: android.content.Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val manager = context.getSystemService(NotificationManager::class.java) ?: return
            val existing = manager.getNotificationChannel(DogmaApp.VPN_CHANNEL_ID)
            if (existing == null) {
                manager.createNotificationChannel(
                    NotificationChannel(
                        DogmaApp.VPN_CHANNEL_ID,
                        "VPN",
                        NotificationManager.IMPORTANCE_LOW,
                    ),
                )
            }
        }
    }
}
