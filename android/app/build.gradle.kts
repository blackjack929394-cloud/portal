import java.net.URI

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization")
}

// Адрес портала по умолчанию. Переопределяется при сборке:
//   gradlew assembleDebug -PportalBaseUrl=https://vpn.example.com
// По умолчанию — актуальный сервер Dogma VPN (как в desktop-клиенте).
val portalBaseUrl = (project.findProperty("portalBaseUrl") as String?) ?: "https://192-144-56-63.sslip.io"

android {
    namespace = "com.dogma.portal"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.dogma.portal"
        minSdk = 24
        targetSdk = 33
        versionCode = 4
        versionName = "2.2.0"

        buildConfigField("String", "PORTAL_BASE_URL", "\"$portalBaseUrl\"")

        // libbox (sing-box) содержит нативные библиотеки. Оставляем телефонные
        // ARM и x86_64 для эмулятора, чтобы не раздувать APK вчетверо.
        ndk {
            abiFilters += listOf("arm64-v8a", "armeabi-v7a", "x86_64")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.8"
    }

    packaging {
        resources.excludes += setOf(
            "META-INF/AL2.0",
            "META-INF/LGPL2.1",
            "META-INF/LICENSE*",
            "META-INF/NOTICE*",
        )
        // gomobile-библиотека libbox грузит .so из APK; legacy packaging
        // проверен на устройствах и в эмуляторе.
        jniLibs {
            useLegacyPackaging = true
        }
    }
}

// libbox.aar (sing-box) не хранится в git: ~118 МБ. При сборке скачиваем
// официальный AAR из GitHub Releases, если файла ещё нет.
val libboxVersion = (project.findProperty("libbox.version") as String?) ?: "1.14.4"
val libboxAar = layout.projectDirectory.file("libs/libbox.aar")
val libboxUrl = (project.findProperty("libbox.aar.url") as String?)
    ?: "https://github.com/singbox-android/libbox/releases/download/$libboxVersion/libbox.aar"

val fetchLibbox by tasks.registering {
    group = "dogma"
    description = "Скачать libbox.aar (sing-box) в app/libs"
    outputs.file(libboxAar)
    onlyIf { !libboxAar.asFile.exists() }
    doLast {
        val dest = libboxAar.asFile
        dest.parentFile.mkdirs()
        logger.lifecycle("Downloading libbox $libboxVersion -> ${dest.absolutePath}")
        URI(libboxUrl).toURL().openStream().use { input ->
            dest.outputStream().use { output -> input.copyTo(output) }
        }
        require(dest.exists() && dest.length() > 1_000_000) {
            "libbox.aar download failed. Put the AAR manually at ${dest.absolutePath}"
        }
    }
}

tasks.named("preBuild").configure {
    dependsOn(fetchLibbox)
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.02.01"))

    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.activity:activity-compose:1.8.2")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.7.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.animation:animation")
    implementation("androidx.compose.material3:material3")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("androidx.security:security-crypto:1.0.0")

    // Сканер QR от Google Play Services: системный UI, автофокус и зум.
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")

    // sing-box (libbox) — реальное ядро Hysteria2.
    implementation(files("libs/libbox.aar"))

    debugImplementation("androidx.compose.ui:ui-tooling")
}
