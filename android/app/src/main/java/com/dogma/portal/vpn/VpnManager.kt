package com.dogma.portal.vpn

import android.content.Context
import android.content.Intent
import android.net.VpnService
import androidx.core.content.ContextCompat

object VpnManager {

    fun prepareIntent(context: Context): Intent? = VpnService.prepare(context)

    fun start(context: Context) {
        val intent = Intent(context, DogmaVpnService::class.java).apply {
            action = DogmaVpnService.ACTION_START
        }
        ContextCompat.startForegroundService(context, intent)
    }

    fun stop(context: Context) {
        val intent = Intent(context, DogmaVpnService::class.java).apply {
            action = DogmaVpnService.ACTION_STOP
        }
        runCatching { context.startService(intent) }
    }
}
