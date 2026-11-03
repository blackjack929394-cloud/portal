package com.dogma.portal.ui.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dogma.portal.AppState
import com.dogma.portal.ui.Strings
import com.dogma.portal.ui.components.CardBox
import com.dogma.portal.ui.components.DogmaTextField
import com.dogma.portal.ui.components.LinkText
import com.dogma.portal.ui.components.OutlineButton
import com.dogma.portal.ui.components.PrimaryButton
import com.dogma.portal.ui.theme.dogmaPalette

@Composable
fun AuthScreen(
    state: AppState,
    t: Strings,
    onLogin: (String, String) -> Unit,
    onRegister: (fullName: String, email: String, username: String, password: String) -> Unit,
    onRetry: () -> Unit,
    onClearError: () -> Unit,
    onSso: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = dogmaPalette()

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(p.bg)
            .verticalScroll(rememberScrollState())
            .imePadding()
            .padding(horizontal = 20.dp, vertical = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column(Modifier.fillMaxWidth().widthIn(max = 460.dp)) {
            Text(
                text = t["authSideTitle"],
                color = p.fg,
                fontSize = 24.sp,
                lineHeight = 29.sp,
                fontWeight = FontWeight.Medium,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = t["authSideLead"],
                color = p.muted,
                fontSize = 14.sp,
                lineHeight = 20.sp,
            )
            Spacer(Modifier.height(20.dp))

            CardBox(padding = 22.dp) {
                when {
                    state.booting -> {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 22.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            CircularProgressIndicator(
                                color = p.warning,
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(28.dp),
                            )
                            Spacer(Modifier.height(14.dp))
                            Text(t["authLoading"], color = p.muted, fontSize = 13.sp)
                        }
                    }

                    state.bootError -> {
                        Text(
                            t["bootErrorTitle"],
                            color = p.fg,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Medium,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(t["bootErrorLead"], color = p.muted, fontSize = 14.sp, lineHeight = 20.sp)
                        Spacer(Modifier.height(20.dp))
                        PrimaryButton(t["retry"], onClick = onRetry, fillWidth = false)
                    }

                    else -> AuthForm(
                        state = state,
                        t = t,
                        onLogin = onLogin,
                        onRegister = onRegister,
                        onClearError = onClearError,
                        onSso = onSso,
                    )
                }
            }
        }
    }
}

@Composable
private fun AuthForm(
    state: AppState,
    t: Strings,
    onLogin: (String, String) -> Unit,
    onRegister: (fullName: String, email: String, username: String, password: String) -> Unit,
    onClearError: () -> Unit,
    onSso: () -> Unit,
) {
    val p = dogmaPalette()
    var registerMode by rememberSaveable { mutableStateOf(false) }
    var loginUsername by rememberSaveable { mutableStateOf("") }
    var loginPassword by rememberSaveable { mutableStateOf("") }
    var fullName by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var username by rememberSaveable { mutableStateOf("") }
    var password by rememberSaveable { mutableStateOf("") }

    val loginValid = loginUsername.isNotBlank() && loginPassword.isNotEmpty()
    val registerValid = fullName.trim().length >= 2 &&
        Regex("^\\S+@\\S+\\.\\S+$").matches(email.trim()) &&
        Regex("^[A-Za-z0-9][A-Za-z0-9_.-]{2,31}$").matches(username.trim()) &&
        password.length >= 8

    Column(Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(p.bg, RoundedCornerShape(8.dp))
                .border(1.dp, p.border, RoundedCornerShape(8.dp))
                .padding(3.dp),
        ) {
            AuthTab(
                text = t["signIn"],
                active = !registerMode,
                modifier = Modifier.weight(1f),
                onClick = {
                    registerMode = false
                    onClearError()
                },
            )
            AuthTab(
                text = t["signUp"],
                active = registerMode,
                modifier = Modifier.weight(1f),
                onClick = {
                    registerMode = true
                    onClearError()
                },
            )
        }
        Spacer(Modifier.height(18.dp))

        if (!registerMode) {
            DogmaTextField(
                value = loginUsername,
                onValueChange = {
                    loginUsername = it
                    onClearError()
                },
                placeholder = "",
                label = t["username"],
                imeAction = ImeAction.Next,
            )
            Spacer(Modifier.height(14.dp))
            DogmaTextField(
                value = loginPassword,
                onValueChange = {
                    loginPassword = it
                    onClearError()
                },
                placeholder = "",
                label = t["password"],
                password = true,
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Done,
                onDone = {
                    if (loginValid && !state.authBusy) {
                        onLogin(loginUsername.trim(), loginPassword)
                    }
                },
            )
            AuthError(state.authError)
            Spacer(Modifier.height(16.dp))
            PrimaryButton(
                text = if (state.authBusy) t["authLoading"] else t["signInButton"],
                enabled = loginValid && !state.authBusy,
                onClick = { onLogin(loginUsername.trim(), loginPassword) },
            )
            if (state.sso) {
                Spacer(Modifier.height(10.dp))
                OutlineButton(
                    text = t["ssoBtn"],
                    onClick = onSso,
                    fillWidth = true,
                    enabled = !state.authBusy,
                )
            }
            Spacer(Modifier.height(8.dp))
            LinkText(
                text = t["toRegister"],
                onClick = {
                    registerMode = true
                    onClearError()
                },
            )
        } else {
            DogmaTextField(
                value = fullName,
                onValueChange = {
                    fullName = it
                    onClearError()
                },
                placeholder = "",
                label = t["fullName"],
                imeAction = ImeAction.Next,
            )
            Spacer(Modifier.height(14.dp))
            DogmaTextField(
                value = email,
                onValueChange = {
                    email = it
                    onClearError()
                },
                placeholder = "",
                label = t["email"],
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Next,
            )
            Spacer(Modifier.height(14.dp))
            DogmaTextField(
                value = username,
                onValueChange = {
                    username = it
                    onClearError()
                },
                placeholder = "",
                label = t["username"],
                imeAction = ImeAction.Next,
            )
            Spacer(Modifier.height(14.dp))
            DogmaTextField(
                value = password,
                onValueChange = {
                    password = it
                    onClearError()
                },
                placeholder = "",
                label = t["password"],
                password = true,
                keyboardType = KeyboardType.Password,
                imeAction = ImeAction.Done,
                onDone = {
                    if (registerValid && !state.authBusy) {
                        onRegister(fullName.trim(), email.trim(), username.trim(), password)
                    }
                },
            )
            AuthError(state.authError)
            Spacer(Modifier.height(16.dp))
            PrimaryButton(
                text = if (state.authBusy) t["authLoading"] else t["signUpButton"],
                enabled = registerValid && !state.authBusy,
                onClick = { onRegister(fullName.trim(), email.trim(), username.trim(), password) },
            )
            if (state.sso) {
                Spacer(Modifier.height(10.dp))
                OutlineButton(
                    text = t["ssoBtn"],
                    onClick = onSso,
                    fillWidth = true,
                    enabled = !state.authBusy,
                )
            }
            Spacer(Modifier.height(8.dp))
            LinkText(
                text = t["toLogin"],
                onClick = {
                    registerMode = false
                    onClearError()
                },
            )
        }
    }
}

@Composable
private fun AuthTab(
    text: String,
    active: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    val p = dogmaPalette()
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(6.dp))
            .background(if (active) p.track else androidx.compose.ui.graphics.Color.Transparent)
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            color = if (active) p.fg else p.muted,
            fontSize = 13.sp,
            fontWeight = if (active) FontWeight.Medium else FontWeight.Normal,
        )
    }
}

@Composable
private fun AuthError(message: String?) {
    if (message.isNullOrBlank()) return
    Spacer(Modifier.height(10.dp))
    Text(
        text = message,
        color = dogmaPalette().danger,
        fontSize = 12.5.sp,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
}
