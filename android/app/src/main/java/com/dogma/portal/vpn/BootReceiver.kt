package com.dogma.portal.vpn

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.VpnService
import android.util.Log
import com.dogma.portal.data.Prefs

/** Автозапуск VPN после перезагрузки, если пользователь включил его в настройках. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val prefs = Prefs(context)
        if (!prefs.autostart) return
        if (prefs.selectedNodeRaw.isNullOrBlank()) return
        if (VpnService.prepare(context) != null) return
        runCatching { VpnManager.start(context) }
            .onFailure { Log.w("DogmaBoot", "autostart failed", it) }
    }
}
