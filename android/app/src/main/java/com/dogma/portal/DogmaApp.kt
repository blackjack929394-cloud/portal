package com.dogma.portal

import android.app.Application
import android.util.Log
import com.dogma.portal.data.Prefs
import com.dogma.portal.vpn.DogmaVpnService
import go.Seq
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.SetupOptions
import java.io.File

class DogmaApp : Application() {

    lateinit var prefs: Prefs
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        prefs = Prefs(this)
        DogmaVpnService.channel(this)
        setupLibbox()
    }

    private fun setupLibbox() {
        runCatching {
            Seq.setContext(this)
            val working = File(filesDir, "sing-box").apply { mkdirs() }
            Libbox.setup(
                SetupOptions().apply {
                    basePath = filesDir.path
                    workingPath = working.path
                    tempPath = cacheDir.path
                    fixAndroidStack = true
                    logMaxLines = 2000
                    debug = false
                },
            )
            Log.i(TAG, "libbox ${Libbox.version()} ready")
        }.onFailure {
            Log.e(TAG, "libbox setup failed", it)
        }
    }

    companion object {
        private const val TAG = "DogmaApp"
        const val VPN_CHANNEL_ID = "dogma_vpn"

        lateinit var instance: DogmaApp
            private set
    }
}
