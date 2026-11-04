package com.dogma.portal.ui.qr

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dogma.portal.QrUi
import com.dogma.portal.ui.Strings
import com.dogma.portal.ui.components.DogmaIcon
import com.dogma.portal.ui.components.DogmaIconKind
import com.dogma.portal.ui.components.DogmaTextField
import com.dogma.portal.ui.components.OutlineButton
import com.dogma.portal.ui.components.PrimaryButton
import com.dogma.portal.ui.theme.dogmaPalette
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions

@Composable
fun QrLoginScreen(
    qr: QrUi,
    t: Strings,
    onClose: () -> Unit,
    onSubmitCode: (String) -> Unit,
) {
    val p = dogmaPalette()
    var manual by rememberSaveable { mutableStateOf("") }

    val scanner = rememberLauncherForActivityResult(ScanContract()) { result ->
        val content = result.contents
        if (!content.isNullOrBlank()) onSubmitCode(content)
    }
    val options = remember(t) {
        ScanOptions().apply {
            setDesiredBarcodeFormats(ScanOptions.QR_CODE)
            setPrompt(t["qrScannerPrompt"])
            setBeepEnabled(false)
            setOrientationLocked(false)
        }
    }

    Box(Modifier.fillMaxSize().background(p.bg)) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .imePadding()
                .padding(horizontal = 20.dp, vertical = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().widthIn(max = 560.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .background(p.card, RoundedCornerShape(10.dp))
                        .border(1.dp, p.border, RoundedCornerShape(10.dp))
                        .clickable(onClick = onClose),
                    contentAlignment = Alignment.Center,
                ) {
                    DogmaIcon(DogmaIconKind.CHEVRON, Modifier.size(16.dp), tint = p.muted)
                }
                Spacer(Modifier.size(12.dp))
                Text(t["qrLoginTitle"], color = p.fg, fontSize = 20.sp, fontWeight = FontWeight.Medium)
            }

            Spacer(Modifier.height(24.dp))

            Column(
                modifier = Modifier.fillMaxWidth().widthIn(max = 480.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                when (qr.status) {
                    "approved" -> {
                        Box(
                            modifier = Modifier
                                .size(72.dp)
                                .background(p.card, CircleShape)
                                .border(1.dp, p.border, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            DogmaIcon(DogmaIconKind.CHECK, Modifier.size(30.dp), tint = p.ok, strokeWidth = 2.2.dp)
                        }
                        Spacer(Modifier.height(20.dp))
                        Text(
                            t["qrApprovedTitle"],
                            color = p.fg,
                            fontSize = 21.sp,
                            fontWeight = FontWeight.Medium,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            t["qrApprovedLead"],
                            color = p.muted,
                            fontSize = 14.sp,
                            lineHeight = 20.sp,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(24.dp))
                        PrimaryButton(t["qrDone"], onClick = onClose)
                    }

                    "waiting" -> {
                        CircularProgressIndicator(
                            color = p.warning,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(34.dp),
                        )
                        Spacer(Modifier.height(22.dp))
                        Text(
                            t["qrWaitingTitle"],
                            color = p.fg,
                            fontSize = 21.sp,
                            fontWeight = FontWeight.Medium,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            t["qrWaitingLead"],
                            color = p.muted,
                            fontSize = 14.sp,
                            lineHeight = 20.sp,
                            textAlign = TextAlign.Center,
                        )
                        qr.deviceName?.let { device ->
                            Spacer(Modifier.height(16.dp))
                            Row(
                                modifier = Modifier
                                    .background(p.card, RoundedCornerShape(10.dp))
                                    .border(1.dp, p.border, RoundedCornerShape(10.dp))
                                    .padding(horizontal = 14.dp, vertical = 9.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                DogmaIcon(DogmaIconKind.DEVICES, Modifier.size(16.dp), tint = p.muted)
                                Spacer(Modifier.size(8.dp))
                                Text(
                                    listOfNotNull(device, qr.platform).joinToString(" · "),
                                    color = p.fg,
                                    fontSize = 13.sp,
                                )
                            }
                        }
                        Spacer(Modifier.height(24.dp))
                        OutlineButton(t["cancel"], onClick = onClose)
                    }

                    "expired", "error" -> {
                        Box(
                            modifier = Modifier
                                .size(72.dp)
                                .background(p.card, CircleShape)
                                .border(1.dp, p.border, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text("!", color = p.danger, fontSize = 30.sp, fontWeight = FontWeight.Medium)
                        }
                        Spacer(Modifier.height(20.dp))
                        Text(
                            if (qr.status == "expired") t["qrExpired"] else t["qrFailedTitle"],
                            color = p.fg,
                            fontSize = 21.sp,
                            fontWeight = FontWeight.Medium,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            qr.error ?: t["qrFailedLead"],
                            color = p.muted,
                            fontSize = 14.sp,
                            lineHeight = 20.sp,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(24.dp))
                        PrimaryButton(
                            t["qrScanButton"],
                            onClick = { scanner.launch(options) },
                        )
                        Spacer(Modifier.height(8.dp))
                        OutlineButton(t["close"], onClick = onClose)
                    }

                    else -> {
                        Box(
                            modifier = Modifier
                                .size(96.dp)
                                .background(p.card, RoundedCornerShape(22.dp))
                                .border(1.dp, p.border, RoundedCornerShape(22.dp)),
                            contentAlignment = Alignment.Center,
                        ) {
                            DogmaIcon(DogmaIconKind.SCAN, Modifier.size(42.dp), tint = p.warning, strokeWidth = 1.6.dp)
                        }
                        Spacer(Modifier.height(22.dp))
                        Text(
                            t["qrLoginLead"],
                            color = p.muted,
                            fontSize = 14.sp,
                            lineHeight = 20.sp,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(24.dp))
                        PrimaryButton(
                            t["qrScanButton"],
                            onClick = { scanner.launch(options) },
                            enabled = !qr.busy,
                        )

                        Spacer(Modifier.height(24.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Box(Modifier.weight(1f).height(1.dp).background(p.border))
                            Text(
                                t["qrOrManual"],
                                color = p.muted,
                                fontSize = 12.sp,
                                modifier = Modifier.padding(horizontal = 12.dp),
                            )
                            Box(Modifier.weight(1f).height(1.dp).background(p.border))
                        }
                        Spacer(Modifier.height(16.dp))
                        DogmaTextField(
                            value = manual,
                            onValueChange = { manual = it },
                            placeholder = t["qrCodePlaceholder"],
                            label = t["qrCodeLabel"],
                        )
                        Spacer(Modifier.height(12.dp))
                        PrimaryButton(
                            text = t["qrContinue"],
                            onClick = { onSubmitCode(manual) },
                            enabled = manual.isNotBlank() && !qr.busy,
                        )
                        if (qr.error != null) {
                            Spacer(Modifier.height(12.dp))
                            Text(
                                qr.error,
                                color = p.danger,
                                fontSize = 12.5.sp,
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                }

                Spacer(Modifier.height(28.dp))
                Text(
                    t["qrSecurityNote"],
                    color = p.muted,
                    fontSize = 12.sp,
                    lineHeight = 17.sp,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}
