// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import cl.dinovance.contigo.update.ApkInspector
import cl.dinovance.contigo.update.CheckResult
import cl.dinovance.contigo.update.HashCheck
import cl.dinovance.contigo.update.HostPolicy
import cl.dinovance.contigo.update.HttpGet
import cl.dinovance.contigo.update.HttpResponse
import cl.dinovance.contigo.update.ReleaseParser
import cl.dinovance.contigo.update.SafeFetcher
import cl.dinovance.contigo.update.SemVer
import cl.dinovance.contigo.update.UpdateError
import cl.dinovance.contigo.update.UpdateException
import cl.dinovance.contigo.update.UpdateService
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.nio.file.Files

class UpdateCoreTest {
    private val apkUrl = "https://github.com/Tufavo1/nido-finanzas/releases/download/v1.3.0/nido-release.apk"
    private val hashUrl = "$apkUrl.sha256"
    private fun release(tag: String = "v1.3.0", draft: Boolean = false, pre: Boolean = false, assets: List<Pair<String, String>> = listOf("nido-release.apk" to apkUrl, "nido-release.apk.sha256" to hashUrl), size: Long = 2_000_000) =
        JSONObject().put("tag_name", tag).put("draft", draft).put("prerelease", pre).put("body", "Mejoras")
            .put("assets", JSONArray(assets.map { JSONObject().put("name", it.first).put("browser_download_url", it.second).put("size", size) })).toString()

    @Test
    fun `versiones semanticas, orden, formula del versionCode y formatos invalidos`() {
        assertTrue(SemVer.parse("v1.10.0")!! > SemVer.parse("1.9.9")!!)
        assertEquals(10_200L, SemVer.parse("1.2.0")!!.code)
        assertEquals(20_305L, SemVer.parse("v2.3.5")!!.code)
        for (bad in listOf(null, "", "1.2", "v1.2.3-rc1", "1.2.3+b", "a.b.c", "1.2.3.4", "1000.0.0", "1.100.0")) assertNull(bad, SemVer.parse(bad))
    }

    @Test
    fun `la formula de build_gradle es la misma que SemVer`() {
        val gradle = File("build.gradle").readText()
        assertTrue(gradle.contains("package.json") && gradle.contains("major * 10000 + minor * 100 + patch"))
    }

    @Test
    fun `una version mayor con sus dos archivos esta disponible`() {
        val r = ReleaseParser.parse(release(), 10_200) as CheckResult.Available
        assertEquals("1.3.0", r.info.versionName); assertEquals(10_300L, r.info.versionCode); assertEquals(2_000_000L, r.info.sizeBytes); assertEquals("Mejoras", r.info.notes)
    }

    @Test
    fun `igual, menor, borrador y prerelease no son actualizacion`() {
        assertEquals(CheckResult.UpToDate, ReleaseParser.parse(release("v1.2.0"), 10_200))
        assertEquals(CheckResult.UpToDate, ReleaseParser.parse(release("v1.1.9"), 10_200))
        assertEquals(CheckResult.UpToDate, ReleaseParser.parse(release(draft = true), 10_200))
        assertEquals(CheckResult.UpToDate, ReleaseParser.parse(release(pre = true), 10_200))
    }

    private fun err(block: () -> Unit): UpdateError = try { block(); throw AssertionError("debia fallar") } catch (e: UpdateException) { e.error }

    @Test
    fun `release sin apk o sin hash, con formato malo, hosts ajenos o tamano absurdo se rechaza`() {
        assertEquals(UpdateError.NO_ASSET, err { ReleaseParser.parse(release(assets = listOf("nido-release.apk" to apkUrl)), 1) })
        assertEquals(UpdateError.NO_ASSET, err { ReleaseParser.parse(release(assets = listOf("nido-release.apk.sha256" to hashUrl)), 1) })
        assertEquals(UpdateError.NO_ASSET, err { ReleaseParser.parse(release(assets = emptyList()), 1) })
        assertEquals(UpdateError.INVALID_FORMAT, err { ReleaseParser.parse("no es json", 1) })
        assertEquals(UpdateError.INVALID_FORMAT, err { ReleaseParser.parse(release("latest"), 1) })
        assertEquals(UpdateError.HOST_NOT_ALLOWED, err { ReleaseParser.parse(release(assets = listOf("nido-release.apk" to "https://evil.test/a.apk", "nido-release.apk.sha256" to hashUrl)), 1) })
        assertEquals(UpdateError.TOO_LARGE, err { ReleaseParser.parse(release(size = 999_999_999_999), 1) })
        assertEquals(UpdateError.TOO_LARGE, err { ReleaseParser.parse(release(size = 0), 1) })
    }

    @Test
    fun `solo https y hosts exactos de GitHub`() {
        assertTrue(HostPolicy.isAllowedDownload("https://github.com/x/y/releases/download/v1/a.apk"))
        assertTrue(HostPolicy.isAllowedDownload("https://objects.githubusercontent.com/abc?x=1"))
        assertTrue(HostPolicy.isAllowedDownload("https://release-assets.githubusercontent.com/abc"))
        assertTrue(HostPolicy.isAllowedApi("https://api.github.com/repos/Tufavo1/nido-finanzas/releases/latest"))
        for (bad in listOf("http://github.com/a", "https://github.com.evil.test/a", "https://evil.test/github.com", "https://user@github.com/a", "https://github.com:8443/a", "https://sub.github.com/a", "https://githubusercontent.com/a", "ftp://github.com/a", "no es url", "https://127.0.0.1/a"))
            assertFalse(bad, HostPolicy.isAllowedDownload(bad))
        assertFalse(HostPolicy.isAllowedApi("https://github.com/repos/x"))
    }

    @Test
    fun `el hash esperado se lee de sha256sum y el calculado coincide`() {
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", HashCheck.parseExpected("BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD  nido-release.apk\n"))
        assertNull(HashCheck.parseExpected("<html>no</html>")); assertNull(HashCheck.parseExpected("abc"))
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", HashCheck.sha256(ByteArrayInputStream("abc".toByteArray())))
    }

    // ---- red falsa
    private class Fake(val routes: Map<String, () -> HttpResponse>) : HttpGet {
        val asked = mutableListOf<String>()
        override fun get(url: String, headers: Map<String, String>): HttpResponse { asked += url; return (routes[url] ?: throw IOException("sin ruta $url"))() }
        init { }
    }
    private fun ok(body: String) = { HttpResponse(200, null, ByteArrayInputStream(body.toByteArray())) }
    private fun redirect(to: String) = { HttpResponse(302, to, ByteArrayInputStream(ByteArray(0))) }

    @Test
    fun `las redirecciones se siguen validando cada salto`() {
        val good = Fake(mapOf(apkUrl to redirect("https://objects.githubusercontent.com/blob?sig=1"), "https://objects.githubusercontent.com/blob?sig=1" to ok("DATA")))
        assertEquals("DATA", SafeFetcher(good).readText(apkUrl, false, 100))
        val bad = Fake(mapOf(apkUrl to redirect("https://evil.test/blob")))
        assertEquals(UpdateError.HOST_NOT_ALLOWED, err { SafeFetcher(bad).readText(apkUrl, false, 100) })
        assertEquals(listOf(apkUrl), bad.asked) // nunca se pidio el host ajeno
        val http = Fake(mapOf(apkUrl to redirect("http://github.com/x")))
        assertEquals(UpdateError.HOST_NOT_ALLOWED, err { SafeFetcher(http).readText(apkUrl, false, 100) })
        val loop = Fake(mapOf(apkUrl to redirect(apkUrl)))
        assertEquals(UpdateError.HOST_NOT_ALLOWED, err { SafeFetcher(loop).readText(apkUrl, false, 100) })
    }

    @Test
    fun `sin red, limite de GitHub y respuesta enorme dan errores tipados`() {
        val api = "https://api.github.com/repos/Tufavo1/nido-finanzas/releases/latest"
        assertEquals(UpdateError.NO_NETWORK, err { SafeFetcher(Fake(emptyMap())).readText(api, true, 100) })
        assertEquals(UpdateError.RATE_LIMITED, err { SafeFetcher(Fake(mapOf(api to { HttpResponse(403, null, ByteArrayInputStream(ByteArray(0))) }))).readText(api, true, 100) })
        assertEquals(UpdateError.RATE_LIMITED, err { SafeFetcher(Fake(mapOf(api to { HttpResponse(429, null, ByteArrayInputStream(ByteArray(0))) }))).readText(api, true, 100) })
        assertEquals(UpdateError.INVALID_FORMAT, err { SafeFetcher(Fake(mapOf(api to { HttpResponse(500, null, ByteArrayInputStream(ByteArray(0))) }))).readText(api, true, 100) })
        assertEquals(UpdateError.TOO_LARGE, err { SafeFetcher(Fake(mapOf(api to ok("x".repeat(500))))).readText(api, true, 100) })
        // la API solo puede ser api.github.com
        assertEquals(UpdateError.HOST_NOT_ALLOWED, err { SafeFetcher(Fake(emptyMap())).readText("https://github.com/x", true, 100) })
    }

    // ---- servicio
    private class Inspector(var pkg: String? = "cl.dinovance.contigo", var code: Long? = 10_300, var sig: Boolean = true) : ApkInspector {
        override fun packageName(file: File) = pkg
        override fun versionCode(file: File) = code
        override fun sameSignature(file: File) = sig
    }
    private val apkBytes = "APK-CONTENT"
    private fun hashOf(s: String) = HashCheck.sha256(ByteArrayInputStream(s.toByteArray()))
    private fun service(insp: Inspector = Inspector(), content: String = apkBytes, hashText: String = hashOf(apkBytes) + "  nido-release.apk"): Pair<UpdateService, Fake> {
        val net = Fake(mapOf(apkUrl to ok(content), hashUrl to ok(hashText)))
        val dir = Files.createTempDirectory("upd").toFile()
        return UpdateService(SafeFetcher(net), insp, { 10_200 }, "cl.dinovance.contigo", "https://api.github.com/repos/Tufavo1/nido-finanzas/releases/latest", dir) to net
    }
    private val info = (ReleaseParser.parse(release(), 10_200) as CheckResult.Available).info

    @Test
    fun `descarga correcta con hash, paquete, version y firma validos dejan el archivo listo`() {
        val (s, _) = service()
        val progress = mutableListOf<Long>()
        val f = s.download(info) { d, _ -> progress += d }
        assertTrue(f.exists() && progress.isNotEmpty())
        assertEquals(f, s.pendingFile())
        s.cleanup()
        assertFalse(f.exists())
        assertEquals(UpdateError.NOTHING_DOWNLOADED, err { s.pendingFile() })
    }

    @Test
    fun `hash distinto, paquete ajeno, downgrade o firma distinta se rechazan y se borra el archivo`() {
        val (a, _) = service(content = "OTRO CONTENIDO")
        assertEquals(UpdateError.HASH_MISMATCH, err { a.download(info) { _, _ -> } })
        assertFalse(File(a.javaClass.getDeclaredField("dir").also { it.isAccessible = true }.get(a) as File, "nido-update.apk").exists())
        assertEquals(UpdateError.WRONG_PACKAGE, err { service(Inspector(pkg = "com.otra.app")).first.download(info) { _, _ -> } })
        assertEquals(UpdateError.DOWNGRADE, err { service(Inspector(code = 10_200)).first.download(info) { _, _ -> } })
        assertEquals(UpdateError.DOWNGRADE, err { service(Inspector(code = 100)).first.download(info) { _, _ -> } })
        assertEquals(UpdateError.WRONG_SIGNATURE, err { service(Inspector(sig = false)).first.download(info) { _, _ -> } })
        assertEquals(UpdateError.INVALID_FORMAT, err { service(hashText = "<html>").first.download(info) { _, _ -> } })
    }

    @Test
    fun `el archivo mas grande que el tope declarado se corta`() {
        val net = Fake(mapOf(apkUrl to ok("x".repeat(100)), hashUrl to ok(hashOf("x") + " a")))
        val f = Files.createTempFile("p", ".apk").toFile()
        assertEquals(UpdateError.TOO_LARGE, err { SafeFetcher(net).download(apkUrl, f, 10) {} })
        assertFalse(f.exists())
    }

    @Test
    fun `comprobar pide solo la URL del repo y nada mas`() {
        val api = "https://api.github.com/repos/Tufavo1/nido-finanzas/releases/latest"
        val net = Fake(mapOf(api to ok(release())))
        val dir = Files.createTempDirectory("upd").toFile()
        val s = UpdateService(SafeFetcher(net), Inspector(), { 10_200 }, "cl.dinovance.contigo", api, dir)
        assertTrue(s.check() is CheckResult.Available)
        assertEquals(listOf(api), net.asked)
        assertEquals(UpdateError.HOST_NOT_ALLOWED, err { UpdateService(SafeFetcher(net), Inspector(), { 1 }, "p", "https://evil.test/x", dir).check() })
    }
}
