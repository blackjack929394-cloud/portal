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
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.dogma.portal.AppState
import com.dogma.portal.ui.Strings
import com.dogma.portal.ui.components.BrandBlock
import com.dogma.portal.ui.components.DogmaIcon
import com.dogma.portal.ui.components.DogmaIconKind
import com.dogma.portal.ui.components.DogmaTextField
import com.dogma.portal.ui.theme.dogmaPalette

@Composable
fun AuthScreen(
    state: AppState,
    t: Strings,
    onLogin: (String, String) -> Unit,
    onRegister: (fullName: String, email: String, username: String, password: String) -> Unit,
    onRetry: () -> Unit,
    onClearError: () -> Unit,
    onOpenServer: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val p = dogmaPalette()

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(p.authBg)
            .imePadding(),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.End,
        ) {
            Box(
                modifier = Modifier
                    .size(38.dp)
                    .clip(RoundedCornerShape(9.dp))
                    .clickable(onClick = onOpenServer),
                contentAlignment = Alignment.Center,
            ) {
                DogmaIcon(DogmaIconKind.GEAR, Modifier.size(19.dp), tint = p.authMuted)
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 42.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            AuthCard(
                modifier = Modifier.fillMaxWidth().widthIn(max = 390.dp),
            ) {
                BrandBlock(logoSize = 84.dp, nameColor = p.authFg, tagColor = Color(0xFF6F6F6F))

                when {
                    state.booting -> {
                        Spacer(Modifier.height(28.dp))
                        CircularProgressIndicator(
                            color = p.authFg,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(28.dp),
                        )
                        Spacer(Modifier.height(14.dp))
                        Text(t["authLoading"], color = p.authMuted, fontSize = 13.sp)
                    }

                    state.bootError -> {
                        Spacer(Modifier.height(24.dp))
                        Text(
                            t["bootErrorTitle"],
                            color = p.authFg,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.SemiBold,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            t["bootErrorLead"],
                            color = p.authMuted,
                            fontSize = 13.sp,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.height(20.dp))
                        AuthButton(t["retry"], onClick = onRetry)
                        Spacer(Modifier.height(10.dp))
                        AuthOutlineButton(t["serverTitle"], onClick = onOpenServer)
                    }

                    else -> {
                        Spacer(Modifier.height(22.dp))
                        AuthForm(
                            state = state,
                            t = t,
                            onLogin = onLogin,
                            onRegister = onRegister,
                            onClearError = onClearError,
                        )
                    }
                }

                Spacer(Modifier.height(18.dp))
                Text(
                    t["authNote"],
                    color = Color(0xFF5F5F5F),
                    fontSize = 11.sp,
                    modifier = Modifier.fillMaxWidth(),
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

@Composable
private fun AuthCard(modifier: Modifier = Modifier, content: @Composable ColumnScopeAlias.() -> Unit) {
    val p = dogmaPalette()
    Column(
        modifier = modifier
            .background(p.authCard, RoundedCornerShape(22.dp))
            .border(1.dp, p.authBorder, RoundedCornerShape(22.dp))
            .padding(horizontal = 26.dp, vertical = 28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        content = content,
    )
}

// Псевдоним, чтобы не тянуть ColumnScope в публичную сигнатуру экрана.
private typealias ColumnScopeAlias = androidx.compose.foundation.layout.ColumnScope

@Composable
private fun AuthForm(
    state: AppState,
    t: Strings,
    onLogin: (String, String) -> Unit,
    onRegister: (fullName: String, email: String, username: String, password: String) -> Unit,
    onClearError: () -> Unit,
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
                .background(Color(0xFF1D1D1D), RoundedCornerShape(11.dp))
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
        Spacer(Modifier.height(16.dp))

        if (!registerMode) {
            DogmaTextField(
                value = loginUsername,
                onValueChange = {
                    loginUsername = it
                    onClearError()
                },
                placeholder = t["username"],
                authStyle = true,
                imeAction = ImeAction.Next,
            )
            Spacer(Modifier.height(10.dp))
            DogmaTextField(
                value = loginPassword,
                onValueChange = {
                    loginPassword = it
                    onClearError()
                },
                placeholder = t["password"],
                authStyle = true,
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
            Spacer(Modifier.height(14.dp))
            AuthButton(
                text = if (state.authBusy) t["authLoading"] else t["signInButton"],
                enabled = loginValid && !state.authBusy,
                onClick = { onLogin(loginUsername.trim(), loginPassword) },
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = t["toRegister"],
                color = p.authMuted,
                fontSize = 12.5.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        registerMode = true
                        onClearError()
                    }
                    .padding(vertical = 6.dp),
                textAlign = TextAlign.Center,
            )
        } else {
            DogmaTextField(
                value = fullName,
                onValueChange = {
                    fullName = it
                    onClearError()
                },
                placeholder = t["fullName"],
                authStyle = true,
                imeAction = ImeAction.Next,
            )
            Spacer(Modifier.height(10.dp))
            DogmaTextField(
                value = email,
                onValueChange = {
                    email = it
                    onClearError()
                },
                placeholder = t["email"],
                authStyle = true,
                keyboardType = KeyboardType.Email,
                imeAction = ImeAction.Next,
            )
            Spacer(Modifier.height(10.dp))
            DogmaTextField(
                value = username,
                onValueChange = {
                    username = it
                    onClearError()
                },
                placeholder = t["username"],
                authStyle = true,
                imeAction = ImeAction.Next,
            )
            Spacer(Modifier.height(10.dp))
            DogmaTextField(
                value = password,
                onValueChange = {
                    password = it
                    onClearError()
                },
                placeholder = t["passwordPh"],
                authStyle = true,
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
            Spacer(Modifier.height(14.dp))
            AuthButton(
                text = if (state.authBusy) t["authLoading"] else t["signUpButton"],
                enabled = registerValid && !state.authBusy,
                onClick = { onRegister(fullName.trim(), email.trim(), username.trim(), password) },
            )
            Spacer(Modifier.height(8.dp))
            Text(
                text = t["toLogin"],
                color = p.authMuted,
                fontSize = 12.5.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        registerMode = false
                        onClearError()
                    }
                    .padding(vertical = 6.dp),
                textAlign = TextAlign.Center,
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
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (active) Color.White else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text,
            color = if (active) Color(0xFF111111) else Color(0xFF8F8F8F),
            fontSize = 13.sp,
            fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

@Composable
private fun AuthError(message: String?) {
    if (message.isNullOrBlank()) return
    Spacer(Modifier.height(10.dp))
    Text(
        text = message,
        color = Color(0xFFFF7B6B),
        fontSize = 12.5.sp,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun AuthButton(
    text: String,
    onClick: () -> Unit,
    enabled: Boolean = true,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().height(46.dp),
        shape = RoundedCornerShape(11.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = Color.White,
            contentColor = Color(0xFF111111),
            disabledContainerColor = Color(0xFF2A2A2A),
            disabledContentColor = Color(0xFF6F6F6F),
        ),
        elevation = null,
    ) {
        Text(text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
    }
}

@Composable
private fun AuthOutlineButton(text: String, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth().height(46.dp),
        shape = RoundedCornerShape(11.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = Color.Transparent,
            contentColor = Color(0xFFEEEEEE),
        ),
        border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF2C2C2C)),
        elevation = null,
    ) {
        Text(text, fontSize = 14.sp, fontWeight = FontWeight.Medium)
    }
}
