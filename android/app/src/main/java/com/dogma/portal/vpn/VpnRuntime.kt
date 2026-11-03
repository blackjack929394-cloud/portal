package com.dogma.portal.vpn

import com.dogma.portal.data.ProxyNode
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

enum class VpnState { DISCONNECTED, CONNECTING, CONNECTED, ERROR }

data class VpnStatus(
    val state: VpnState = VpnState.DISCONNECTED,
    val node: ProxyNode? = null,
    val error: String? = null,
    val connectedSince: Long = 0L,
    val rx: Long = 0L,
    val tx: Long = 0L,
    val rxSpeed: Double = 0.0,
    val txSpeed: Double = 0.0,
)

/**
 * Состояние VPN-ядра, общее для foreground-сервиса и UI.
 * Сервис живёт в том же процессе, поэтому достаточно singleton + StateFlow.
 */
object VpnRuntime {

    private val _status = MutableStateFlow(VpnStatus())
    val status: StateFlow<VpnStatus> = _status.asStateFlow()

    fun setConnecting(node: ProxyNode) {
        _status.value = VpnStatus(state = VpnState.CONNECTING, node = node)
    }

    fun setConnected(node: ProxyNode, since: Long) {
        _status.value = VpnStatus(state = VpnState.CONNECTED, node = node, connectedSince = since)
    }

    fun setError(message: String) {
        _status.update { it.copy(state = VpnState.ERROR, error = message) }
    }

    fun setDisconnected() {
        _status.value = VpnStatus()
    }

    fun updateTraffic(rx: Long, tx: Long, rxSpeed: Double, txSpeed: Double) {
        _status.update {
            if (it.state == VpnState.CONNECTED) {
                it.copy(rx = rx, tx = tx, rxSpeed = rxSpeed, txSpeed = txSpeed)
            } else {
                it
            }
        }
    }
}
