package com.dogma.portal.vpn

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Process
import android.system.OsConstants
import android.util.Log
import io.nekohasekai.libbox.BridgeOptions
import io.nekohasekai.libbox.BridgeSession
import io.nekohasekai.libbox.ConnectionOwner
import io.nekohasekai.libbox.InterfaceUpdateListener
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.LocalDNSTransport
import io.nekohasekai.libbox.NeighborUpdateListener
import io.nekohasekai.libbox.NetworkInterfaceIterator
import io.nekohasekai.libbox.Notification
import io.nekohasekai.libbox.PlatformInterface
import io.nekohasekai.libbox.PlatformUser
import io.nekohasekai.libbox.ShellSession
import io.nekohasekai.libbox.StringIterator
import io.nekohasekai.libbox.TunOptions
import io.nekohasekai.libbox.WIFIState
import io.nekohasekai.libbox.NetworkInterface as LibboxNetworkInterface
import java.net.Inet6Address
import java.net.InetSocketAddress
import java.util.Collections
import java.net.NetworkInterface as JavaNetworkInterface

class StringArray(private val values: List<String>) : StringIterator {
    private val iterator = values.iterator()
    override fun len(): Int = values.size
    override fun hasNext(): Boolean = iterator.hasNext()
    override fun next(): String = iterator.next()
}

private class NetworkInterfaceArray(
    private val values: List<LibboxNetworkInterface>,
) : NetworkInterfaceIterator {
    private val iterator = values.iterator()
    override fun hasNext(): Boolean = iterator.hasNext()
    override fun next(): LibboxNetworkInterface = iterator.next()
}

/**
 * Минимальный монитор default-интерфейса: libbox через него узнаёт,
 * какой интерфейс использовать для auto_detect_interface.
 */
object DefaultNetworkMonitor {
    private const val TAG = "DogmaNetMon"
    @Volatile private var defaultNetwork: Network? = null
    private var listener: InterfaceUpdateListener? = null
    private var registered = false
    private var appContext: Context? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            defaultNetwork = network
            notifyListener(network)
        }

        override fun onLost(network: Network) {
            if (defaultNetwork == network) {
                defaultNetwork = null
                notifyListener(null)
            }
        }

        override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
            defaultNetwork = network
            notifyListener(network)
        }
    }

    fun start(context: Context) {
        appContext = context.applicationContext
        if (registered) return
        val cm = context.getSystemService(ConnectivityManager::class.java) ?: return
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        runCatching {
            cm.registerNetworkCallback(request, callback)
            registered = true
            defaultNetwork = cm.activeNetwork
            notifyListener(defaultNetwork)
        }.onFailure { Log.w(TAG, "registerNetworkCallback failed", it) }
    }

    fun stop() {
        val cm = appContext?.getSystemService(ConnectivityManager::class.java)
        if (registered && cm != null) {
            runCatching { cm.unregisterNetworkCallback(callback) }
        }
        registered = false
        listener = null
        defaultNetwork = null
        appContext = null
    }

    fun setListener(value: InterfaceUpdateListener?) {
        listener = value
        notifyListener(defaultNetwork)
    }

    private fun notifyListener(network: Network?) {
        val current = listener ?: return
        mainHandler.post {
            runCatching {
                if (network == null) {
                    current.updateDefaultInterface("", -1, false, false)
                    return@post
                }
                val cm = appContext?.getSystemService(ConnectivityManager::class.java) ?: return@post
                val props = cm.getLinkProperties(network) ?: return@post
                val name = props.interfaceName ?: return@post
                val index = runCatching { JavaNetworkInterface.getByName(name)?.index ?: -1 }
                    .getOrDefault(-1)
                current.updateDefaultInterface(name, index, false, false)
            }.onFailure { Log.w(TAG, "notifyListener", it) }
        }
    }
}

/**
 * PlatformInterface для libbox: TUN создаётся через наш VpnService,
 * исходящие сокеты ядра защищаются через VpnService.protect().
 */
class DogmaPlatformInterface(
    private val service: DogmaVpnService,
) : PlatformInterface {

    override fun usePlatformAutoDetectInterfaceControl(): Boolean = true

    override fun autoDetectInterfaceControl(fd: Int) {
        if (!service.protect(fd)) {
            Log.w(TAG, "protect(fd=$fd) failed")
        }
    }

    override fun openTun(options: TunOptions): Int {
        val builder = service.newVpnBuilder(options.mtu)
        val v4 = options.inet4Address
        while (v4.hasNext()) {
            val prefix = v4.next()
            builder.addAddress(prefix.address(), prefix.prefix())
        }
        val v6 = options.inet6Address
        while (v6.hasNext()) {
            val prefix = v6.next()
            builder.addAddress(prefix.address(), prefix.prefix())
        }

        if (options.autoRoute) {
            val dns = options.dnsServerAddress
            var hasDns = false
            while (dns.hasNext()) {
                val server = dns.next()
                if (server.isNotBlank()) {
                    builder.addDnsServer(server)
                    hasDns = true
                }
            }
            if (!hasDns) builder.addDnsServer("1.1.1.1")

            var addedRoute = false
            val v4range = options.inet4RouteRange
            while (v4range.hasNext()) {
                val prefix = v4range.next()
                builder.addRoute(prefix.address(), prefix.prefix())
                addedRoute = true
            }
            val v6range = options.inet6RouteRange
            while (v6range.hasNext()) {
                val prefix = v6range.next()
                builder.addRoute(prefix.address(), prefix.prefix())
                addedRoute = true
            }
            if (!addedRoute) {
                builder.addRoute("0.0.0.0", 0)
            }
        }

        // include/exclude списки приложений (мы их не используем, но пусть работают)
        val include = options.includePackage
        while (include.hasNext()) {
            runCatching { builder.addAllowedApplication(include.next()) }
        }
        val exclude = options.excludePackage
        while (exclude.hasNext()) {
            runCatching { builder.addDisallowedApplication(exclude.next()) }
        }

        val pfd = builder.establish()
            ?: error("VPN establish returned null (permission revoked?)")
        service.attachTun(pfd)
        Log.i(TAG, "TUN established fd=${pfd.fd}")
        return pfd.fd
    }

    override fun findConnectionOwner(
        ipProtocol: Int,
        sourceAddress: String?,
        sourcePort: Int,
        destinationAddress: String?,
        destinationPort: Int,
    ): ConnectionOwner {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            error("findConnectionOwner requires API 29+")
        }
        val cm = service.getSystemService(ConnectivityManager::class.java)
            ?: error("no ConnectivityManager")
        val uid = cm.getConnectionOwnerUid(
            ipProtocol,
            InetSocketAddress(sourceAddress, sourcePort),
            InetSocketAddress(destinationAddress, destinationPort),
        )
        if (uid == Process.INVALID_UID) error("connection owner not found")
        val packages = service.packageManager.getPackagesForUid(uid)
        return ConnectionOwner().apply {
            userId = uid
            userName = packages?.firstOrNull().orEmpty()
            setAndroidPackageNames(StringArray(packages?.toList().orEmpty()))
        }
    }

    override fun startDefaultInterfaceMonitor(listener: InterfaceUpdateListener?) {
        DefaultNetworkMonitor.start(service)
        DefaultNetworkMonitor.setListener(listener)
    }

    override fun closeDefaultInterfaceMonitor(listener: InterfaceUpdateListener?) {
        DefaultNetworkMonitor.setListener(null)
    }

    override fun getInterfaces(): NetworkInterfaceIterator {
        val result = mutableListOf<LibboxNetworkInterface>()
        val cm = service.getSystemService(ConnectivityManager::class.java)
        val javaInterfaces = Collections.list(JavaNetworkInterface.getNetworkInterfaces())

        if (cm != null) {
            for (network in cm.allNetworks) {
                val props = cm.getLinkProperties(network) ?: continue
                val caps = cm.getNetworkCapabilities(network) ?: continue
                val name = props.interfaceName ?: continue
                val jni = javaInterfaces.find { it.name == name } ?: continue
                val box = LibboxNetworkInterface()
                box.name = name
                box.index = jni.index
                runCatching { box.mtu = jni.mtu }
                box.dnsServer = StringArray(props.dnsServers.mapNotNull { it.hostAddress })
                box.type = when {
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> Libbox.InterfaceTypeWIFI
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> Libbox.InterfaceTypeCellular
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> Libbox.InterfaceTypeEthernet
                    else -> Libbox.InterfaceTypeOther
                }
                box.addresses = StringArray(
                    jni.interfaceAddresses.mapNotNull { address ->
                        val host = address.address.hostAddress ?: return@mapNotNull null
                        val cleaned = if (address.address is Inet6Address) host.substringBefore('%') else host
                        "$cleaned/${address.networkPrefixLength}"
                    },
                )
                var flags = 0
                if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
                    flags = flags or OsConstants.IFF_UP or OsConstants.IFF_RUNNING
                }
                if (jni.isLoopback) flags = flags or OsConstants.IFF_LOOPBACK
                if (jni.isPointToPoint) flags = flags or OsConstants.IFF_POINTOPOINT
                if (jni.supportsMulticast()) flags = flags or OsConstants.IFF_MULTICAST
                box.flags = flags
                box.metered = !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
                result.add(box)
            }
        }

        if (result.isEmpty()) {
            for (jni in javaInterfaces) {
                val box = LibboxNetworkInterface()
                box.name = jni.name
                box.index = jni.index
                runCatching { box.mtu = jni.mtu }
                box.type = Libbox.InterfaceTypeOther
                box.addresses = StringArray(
                    jni.interfaceAddresses.mapNotNull { address ->
                        val host = address.address.hostAddress ?: return@mapNotNull null
                        val cleaned = if (address.address is Inet6Address) host.substringBefore('%') else host
                        "$cleaned/${address.networkPrefixLength}"
                    },
                )
                result.add(box)
            }
        }
        return NetworkInterfaceArray(result)
    }

    override fun underNetworkExtension(): Boolean = false
    override fun includeAllNetworks(): Boolean = false
    override fun clearDNSCache() {}
    override fun readWIFIState(): WIFIState? = null
    override fun localDNSTransport(): LocalDNSTransport? = null
    override fun sendNotification(notification: Notification?) {}
    override fun registerMyInterface(name: String) {}
    override fun usePlatformBridge(): Boolean = false
    override fun usePlatformShell(): Boolean = false
    override fun checkPlatformShell() {}
    override fun tailscaleHostname(): String = ""
    override fun cancelNotification(identifier: String?, typeID: Int) {}
    override fun closeNeighborMonitor(listener: NeighborUpdateListener?) {}
    override fun startNeighborMonitor(listener: NeighborUpdateListener?) {}
    override fun lookupSFTPServer(): String = error("not supported")
    override fun lookupUser(username: String?): PlatformUser = error("not supported")
    override fun openShellSession(
        user: PlatformUser?,
        command: String?,
        environ: StringIterator?,
        term: String?,
        rows: Int,
        cols: Int,
    ): ShellSession = error("not supported")
    override fun readSystemSSHHostKey(): String = error("not supported")
    override fun createBridge(options: BridgeOptions?): BridgeSession = error("not supported")

    private companion object {
        const val TAG = "DogmaPlatform"
    }
}
