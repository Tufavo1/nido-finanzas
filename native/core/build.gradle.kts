// Copyright (c) 2026 Dinovance
// Nucleo Kotlin Multiplatform (DEC-06): parser de avisos, importes CLP, huella, enlace profundo y reglas del modo automatico.
// Android lo consume como build incluido (cl.nido:core, destino jvm); iOS como XCFramework (solo en un Mac, ver docs/mobile/kmp.md).
plugins {
    kotlin("multiplatform") version "2.0.21"
    kotlin("plugin.serialization") version "2.0.21"
}

group = "cl.nido"

repositories {
    mavenCentral()
}

kotlin {
    jvmToolchain(21)
    jvm {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }
    // Objetivos de iOS: solo se declaran en macOS. En Linux, con solo declararlos Gradle descarga el compilador de
    // Kotlin/Native (~400 MB) aunque no pueda usarlo (kotlin.native.ignoreDisabledTargets no lo evita).
    if (org.gradle.internal.os.OperatingSystem.current().isMacOsX) {
        iosArm64()
        iosSimulatorArm64()
        iosX64()
    }

    sourceSets {
        commonTest.dependencies {
            implementation(kotlin("test"))
        }
        jvmTest.dependencies {
            implementation(platform("org.junit:junit-bom:5.11.3"))
            implementation("org.junit.jupiter:junit-jupiter")
            implementation("org.junit.jupiter:junit-jupiter-params")
            runtimeOnly("org.junit.platform:junit-platform-launcher")
            implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.3")
        }
    }
}

tasks.withType<Test> {
    useJUnitPlatform()
    testLogging {
        events("passed", "failed", "skipped")
        showExceptions = true
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.SHORT
    }
}
