// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.w3c.dom.Element
import java.io.File
import javax.xml.parsers.DocumentBuilderFactory

/**
 * Ronda 5 (regresion permanente). Lee el manifiesto FUSIONADO (lo que de verdad va al APK, con lo que agregan las
 * librerias) y la politica unica scripts/apk-security-policy.txt. Falla si aparece un permiso no permitido, un
 * componente exportado fuera de la lista blanca o sin el permiso que lo protege, android:debuggable, copias de
 * seguridad, trafico en claro, un enlace https sin verificar o un esquema propio no previsto.
 * build.gradle hace que esta prueba dependa de processDebugMainManifest/processReleaseMainManifest.
 */
class ManifestSecurityTest {
    private val android = "http://schemas.android.com/apk/res/android"
    private val appDir = File(System.getProperty("contigo.appDir") ?: ".").absoluteFile
    private val repo = File(System.getProperty("contigo.repoRoot") ?: "../../..").absoluteFile

    private data class Policy(
        val pkg: String, val label: String, val minTarget: Int, val permissions: Set<String>, val forbidden: Set<String>,
        val exported: Map<String, String?>, val deepLinks: Set<String>, val listener: String,
    )

    private val policy: Policy by lazy {
        val f = File(repo, "scripts/apk-security-policy.txt")
        assertTrue("Falta la politica $f", f.isFile)
        val rows = f.readLines().map { it.substringBefore('#').trim() }.filter { it.isNotEmpty() }.map { it.split(Regex("\\s+")) }
        fun one(k: String) = rows.single { it[0] == k }[1]
        val pkg = one("package")
        fun sub(s: String) = s.replace("\${pkg}", pkg)
        Policy(
            pkg, one("label"), one("min_target_sdk").toInt(),
            rows.filter { it[0] == "permission" }.map { sub(it[1]) }.toSet(),
            rows.filter { it[0] == "forbidden_permission" }.map { sub(it[1]) }.toSet(),
            rows.filter { it[0] == "exported" }.associate { it[1] to it[2].takeIf { p -> p != "-" } },
            rows.filter { it[0] == "deeplink" }.map { it[1] }.toSet(),
            one("listener_service"),
        )
    }

    private fun parse(f: File): Element {
        assertTrue("No existe $f (corre processDebugMainManifest/processReleaseMainManifest)", f.isFile)
        val dbf = DocumentBuilderFactory.newInstance().apply {
            isNamespaceAware = true
            setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
        }
        return dbf.newDocumentBuilder().parse(f).documentElement
    }

    private fun Element.kids(tag: String): List<Element> {
        val out = mutableListOf<Element>()
        val n = childNodes
        for (i in 0 until n.length) (n.item(i) as? Element)?.takeIf { it.tagName == tag }?.let(out::add)
        return out
    }

    private fun Element.a(name: String): String? = getAttributeNS(android, name).takeIf { hasAttributeNS(android, name) }

    private fun merged(variant: String): Element {
        val prop = System.getProperty("contigo.mergedManifest.$variant")
        val cap = variant.replaceFirstChar { it.uppercase() }
        val f = prop?.let(::File) ?: File(appDir, "build/intermediates/merged_manifest/$variant/process${cap}MainManifest/AndroidManifest.xml")
        return parse(f)
    }

    private fun checkManifest(m: Element, variant: String) {
        val p = policy
        val errors = mutableListOf<String>()
        if (m.getAttribute("package").let { it.isNotEmpty() && it != p.pkg }) errors += "paquete ${m.getAttribute("package")} != ${p.pkg}"

        // targetSdk
        m.kids("uses-sdk").firstOrNull()?.a("targetSdkVersion")?.toIntOrNull()?.let {
            if (it < p.minTarget) errors += "targetSdkVersion $it < ${p.minTarget}"
        }

        // Permisos exactos
        val perms = (m.kids("uses-permission") + m.kids("uses-permission-sdk-23")).mapNotNull { it.a("name") }.toSet()
        (perms intersect p.forbidden).forEach { errors += "permiso PROHIBIDO $it" }
        (perms - p.permissions).forEach { errors += "permiso no permitido $it (quitalo con tools:node=\"remove\" o justificalo en la politica)" }
        (p.permissions - perms).forEach { errors += "falta el permiso esperado $it (actualiza la politica si ya no se usa)" }
        m.kids("permission").forEach { d ->
            val lvl = d.a("protectionLevel") ?: "normal"
            if (!lvl.contains("signature")) errors += "permiso propio ${d.a("name")} con protectionLevel=$lvl (debe ser signature)"
        }

        // <queries>: nada de QUERY_ALL_PACKAGES y solo apps con icono de lanzador
        m.kids("queries").flatMap { it.kids("package") }.forEach { errors += "queries/package ${it.a("name")} no previsto" }
        m.kids("queries").flatMap { it.kids("provider") }.forEach { errors += "queries/provider ${it.a("authorities")} no previsto" }

        val app = m.kids("application").single()
        // El debug lleva debuggable=true a proposito (lo inyecta AGP); el release NUNCA (y el APK lo revisa verify-apk-security.sh).
        if (variant == "release" && app.a("debuggable") == "true") errors += "android:debuggable=true en release"
        if (app.a("testOnly") == "true") errors += "android:testOnly=true"
        if (app.a("allowBackup") != "false") errors += "allowBackup debe ser false (es ${app.a("allowBackup")})"
        if (app.a("fullBackupContent") != "false") errors += "fullBackupContent debe ser false"
        if (app.a("dataExtractionRules") != "@xml/data_extraction_rules") errors += "falta dataExtractionRules (Android 12+)"
        if (app.a("usesCleartextTraffic") != "false") errors += "usesCleartextTraffic debe ser false"
        if (app.a("networkSecurityConfig") != "@xml/network_security_config") errors += "falta networkSecurityConfig"
        if (app.a("label") != "@string/app_name") errors += "la etiqueta debe ser @string/app_name"
        if (app.a("requestLegacyExternalStorage") == "true") errors += "requestLegacyExternalStorage=true"

        val components = listOf("activity", "activity-alias", "service", "receiver", "provider").flatMap { app.kids(it) }
        for (c in components) {
            val name = c.a("name") ?: "?"
            val filters = c.kids("intent-filter")
            val exported = c.a("exported")
            if (exported == null && filters.isNotEmpty()) errors += "$name tiene intent-filter sin android:exported explicito"
            if (exported == "true") {
                if (!p.exported.containsKey(name)) errors += "$name exportado y fuera de la lista blanca"
                else {
                    val need = p.exported[name]
                    val has = c.a("permission")
                    if (need != null && has != need) errors += "$name exportado debe exigir $need (tiene $has)"
                    if (need == null && has != null) errors += "$name: la politica lo da por publico pero declara $has; actualiza la politica"
                }
            }
            if (c.tagName == "provider" && exported == "true") errors += "proveedor $name exportado"
            if (c.tagName == "activity" && c.a("taskAffinity") != null && c.a("taskAffinity") != "" && c.a("exported") == "true") {
                errors += "$name exportada con taskAffinity ${c.a("taskAffinity")} (riesgo de secuestro de tarea)"
            }
            // Enlaces: VIEW+BROWSABLE
            for (f in filters) {
                val actions = f.kids("action").mapNotNull { it.a("name") }
                val cats = f.kids("category").mapNotNull { it.a("name") }
                if ("android.intent.action.VIEW" !in actions || "android.intent.category.BROWSABLE" !in cats) continue
                val data = f.kids("data")
                val schemes = data.mapNotNull { it.a("scheme") }.toSet()
                val hosts = data.mapNotNull { it.a("host") }.toSet()
                if (schemes.isEmpty() || hosts.isEmpty()) errors += "$name: enlace BROWSABLE sin esquema o sin host"
                if (data.any { it.a("pathPattern") != null || it.a("pathAdvancedPattern") != null || it.a("host")?.contains('*') == true }) {
                    errors += "$name: enlace con comodines"
                }
                for (s in schemes) for (h in hosts) {
                    val link = "$s://$h"
                    if (s == "http") errors += "$name: enlace http (en claro) $link"
                    if (s == "https" && f.getAttributeNS(android, "autoVerify") != "true") errors += "$name: App Link $link sin autoVerify"
                    if (link !in p.deepLinks) errors += "$name: enlace $link no esta en la politica"
                }
            }
        }

        // MainActivity: tarea propia (anti task hijacking)
        val main = app.kids("activity").firstOrNull { it.a("name") == "${p.pkg}.MainActivity" }
        if (main == null) errors += "no hay MainActivity" else if (main.a("taskAffinity") != "") errors += "MainActivity debe tener taskAffinity=\"\""

        // Listener: proposito declarado y no toma notificaciones persistentes
        val listener = app.kids("service").firstOrNull { it.a("name") == p.listener }
        if (listener == null) errors += "no esta el listener ${p.listener}" else {
            val meta = listener.kids("meta-data").associate { it.a("name") to it.a("value") }
            val def = meta["android.service.notification.default_filter_types"]?.split('|')?.toSet()
            if (def == null) errors += "el listener no declara default_filter_types"
            else if ("conversations" in def || "ongoing" in def) errors += "el listener toma conversaciones o persistentes por defecto: $def"
            if (meta["android.service.notification.disabled_filter_types"]?.split('|')?.contains("ongoing") != true) {
                errors += "el listener debe deshabilitar 'ongoing'"
            }
        }

        if (errors.isNotEmpty()) fail("Manifiesto fusionado ($variant) incumple la politica de seguridad:\n - " + errors.joinToString("\n - "))
    }

    @Test
    fun `manifiesto fusionado debug cumple la politica`() = checkManifest(merged("debug"), "debug")

    @Test
    fun `manifiesto fusionado release cumple la politica`() = checkManifest(merged("release"), "release")

    @Test
    fun `la etiqueta visible es Contigo y el paquete cl dinovance contigo`() {
        val strings = parse(File(appDir, "src/main/res/values/strings.xml"))
        val byName = strings.kids("string").associate { it.getAttribute("name") to it.textContent }
        assertEquals(policy.label, byName["app_name"])
        assertEquals(policy.label, byName["title_activity_main"])
        val gradle = File(appDir, "build.gradle").readText()
        assertTrue("applicationId debe ser ${policy.pkg}", gradle.contains("applicationId \"${policy.pkg}\""))
    }

    @Test
    fun `network security config solo HTTPS y autoridades del sistema`() {
        val f = File(appDir, "src/main/res/xml/network_security_config.xml")
        val root = parse(f)
        val text = f.readText()
        assertTrue("cleartextTrafficPermitted=\"true\" en $f", !text.contains(Regex("cleartextTrafficPermitted\\s*=\\s*\"true\"")))
        assertTrue("no se confia en certificados instalados por la persona", !text.contains(Regex("src\\s*=\\s*\"user\"")))
        assertTrue("sin debug-overrides en el config de produccion", root.getElementsByTagName("debug-overrides").length == 0)
        val base = root.getElementsByTagName("base-config").item(0) as? Element ?: return fail("falta base-config")
        assertEquals("false", base.getAttribute("cleartextTrafficPermitted"))
        val certs = root.getElementsByTagName("certificates")
        for (i in 0 until certs.length) assertEquals("system", (certs.item(i) as Element).getAttribute("src"))
    }

    @Test
    fun `sin copias ni transferencia de datos y FileProvider minimo`() {
        val rules = parse(File(appDir, "src/main/res/xml/data_extraction_rules.xml"))
        for (section in listOf("cloud-backup", "device-transfer")) {
            val s = rules.getElementsByTagName(section).item(0) as? Element ?: return fail("falta $section")
            assertEquals("$section no debe incluir nada", 0, s.getElementsByTagName("include").length)
            val excluded = (0 until s.getElementsByTagName("exclude").length).map { (s.getElementsByTagName("exclude").item(it) as Element).getAttribute("domain") }.toSet()
            assertTrue("$section debe excluir root/file/database/sharedpref: $excluded", excluded.containsAll(setOf("root", "file", "database", "sharedpref")))
        }
        val paths = parse(File(appDir, "src/main/res/xml/file_paths.xml"))
        val n = paths.childNodes
        for (i in 0 until n.length) {
            val e = n.item(i) as? Element ?: continue
            assertTrue("FileProvider: ${e.tagName} no permitido", e.tagName == "cache-path" || e.tagName == "files-path")
            val path = e.getAttribute("path")
            assertTrue("FileProvider: ruta demasiado amplia '$path'", path.isNotBlank() && path != "." && path != "/" && !path.contains(".."))
        }
    }

    @Test
    fun `Capacitor sin depuracion de WebView, sin contenido mixto, sin server url ni allowNavigation`() {
        val ts = File(repo, "web/capacitor.config.ts").readText()
        assertTrue(ts.contains(Regex("webContentsDebuggingEnabled:\\s*false")))
        assertTrue(ts.contains(Regex("allowMixedContent:\\s*false")))
        assertTrue(ts.contains(Regex("loggingBehavior:\\s*'none'")))
        for (bad in listOf("server:", "allowNavigation", "cleartext", "url:")) assertTrue("capacitor.config.ts no debe tener $bad", !ts.contains(bad))
        val json = File(appDir, "src/main/assets/capacitor.config.json")
        if (json.isFile) {
            val o = org.json.JSONObject(json.readText())
            assertTrue("capacitor.config.json no debe tener server", !o.has("server"))
            assertEquals(false, o.getJSONObject("android").optBoolean("webContentsDebuggingEnabled", true))
            assertEquals(false, o.getJSONObject("android").optBoolean("allowMixedContent", true))
            assertEquals("none", o.optString("loggingBehavior"))
        }
    }

    @Test
    fun `codigo propio sin carga dinamica de codigo, sin logs y sin PendingIntent mutables salvo el instalador`() {
        val roots = listOf(File(appDir, "src/main/java"), File(appDir, "src/main/kotlin"))
        val files = roots.flatMap { r -> r.walkTopDown().filter { it.isFile && (it.extension == "kt" || it.extension == "java") }.toList() }
        assertTrue("no encontre codigo fuente en $roots", files.isNotEmpty())
        val banned = mapOf(
            "DexClassLoader" to "carga dinamica de codigo", "InMemoryDexClassLoader" to "carga dinamica de codigo",
            "PathClassLoader" to "carga dinamica de codigo", "System.loadLibrary" to "codigo nativo descargable",
            "Runtime.getRuntime().exec" to "ejecutar comandos", "ProcessBuilder(" to "ejecutar comandos",
            "addJavascriptInterface" to "puente JS fuera de Capacitor", "setWebContentsDebuggingEnabled(true)" to "depuracion de WebView",
            "setAllowUniversalAccessFromFileURLs(true)" to "WebView con acceso universal", "setAllowFileAccessFromFileURLs(true)" to "WebView con acceso a archivos",
            "MODE_WORLD_READABLE" to "archivo legible por otras apps", "MODE_WORLD_WRITEABLE" to "archivo escribible por otras apps",
            "android.util.Log" to "log del sistema", "Log.d(" to "logcat", "Log.i(" to "logcat", "Log.v(" to "logcat", "Log.w(" to "logcat", "Log.e(" to "logcat",
            "printStackTrace()" to "logcat", "println(" to "logcat", "TrustManager" to "TLS propio", "HostnameVerifier" to "TLS propio",
            "setHostnameVerifier" to "TLS propio", "ALLOW_ALL_HOSTNAME_VERIFIER" to "TLS propio",
        )
        val problems = mutableListOf<String>()
        for (f in files) {
            val text = f.readText()
            for ((needle, why) in banned) if (text.contains(needle)) problems += "${f.relativeTo(appDir)}: $needle ($why)"
            if (text.contains("FLAG_MUTABLE") && f.name != "UpdateAndroid.kt") problems += "${f.relativeTo(appDir)}: PendingIntent FLAG_MUTABLE fuera del instalador"
        }
        if (problems.isNotEmpty()) fail("Codigo propio con APIs no permitidas:\n - " + problems.joinToString("\n - "))
    }

    @Test
    fun `MainActivity mantiene FLAG_SECURE y el filtro de enlaces`() {
        val main = File(appDir, "src/main/java/cl/dinovance/contigo/MainActivity.java").readText()
        assertTrue("FLAG_SECURE en MainActivity (S-04)", main.contains("FLAG_SECURE"))
        assertTrue("DeepLinkGuard en onCreate y onNewIntent", Regex("DeepLinkGuard\\.INSTANCE\\.sanitize").findAll(main).count() >= 2)
    }

    @Test
    fun `release endurecido en build gradle`() {
        val g = File(appDir, "build.gradle").readText()
        val release = g.substringAfter("buildTypes {").substringAfter("release {").substringBefore("}")
        assertTrue("release: debuggable false", release.contains("debuggable false"))
        assertTrue("release: minifyEnabled true", release.contains("minifyEnabled true"))
        assertTrue("release: shrinkResources true", release.contains("shrinkResources true"))
        assertTrue("firma v2 y v3", g.contains("enableV2Signing true") && g.contains("enableV3Signing true"))
        assertTrue("sin llave no hay release", g.contains("Release sin llave de firma"))
        val pg = File(appDir, "proguard-rules.pro").readLines().map { it.trim() }.filter { !it.startsWith("#") }
        for (bad in listOf("-dontobfuscate", "-dontoptimize", "-keep class * {", "-keep class ** {", "-keep class *.** {", "-keepnames class **", "-applymapping", "-obfuscationdictionary")) {
            assertTrue("proguard-rules.pro: $bad no permitido", pg.none { it.startsWith(bad) })
        }
    }
}
