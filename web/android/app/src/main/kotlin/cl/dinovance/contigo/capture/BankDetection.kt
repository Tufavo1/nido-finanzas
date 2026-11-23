// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import java.text.Normalizer

/** App instalada con icono de lanzador: paquete y nombre visible. Nada mas. */
data class InstalledApp(val packageName: String, val label: String)

/** installed = coincide por nombre visible; seen = paquete aprendido (modo aprender / correccion manual); not_found = sin app. */
enum class DetectStatus { installed, seen, not_found }

data class DetectedBank(val bankId: String, val appLabel: String?, val packageName: String?, val status: DetectStatus)

/**
 * Reconoce la app de un banco por su NOMBRE VISIBLE, sin inventar nombres de paquete. Regla conservadora: se normaliza el nombre
 * (minusculas, sin tildes, solo letras y numeros), se quitan palabras sueltas permitidas por banco («app», «chile», «movil»...) y
 * lo que queda, sin espacios, debe ser EXACTAMENTE una de las formas conocidas. Cualquier otra palabra («Trade», «Peru», «Empresas»,
 * «Consumer»...) deja la app fuera: es preferible no detectar (se corrige a mano en Avanzado) que mezclar otro producto u otro pais.
 */
object BankMatcher {
    private class Rule(val bankId: String, val cores: Set<String>, val extras: Set<String>)

    private val RULES = listOf(
        Rule("santander", setOf("santander", "bancosantander"), setOf("chile", "mi", "app", "movil")),
        Rule("banco-estado", setOf("bancoestado", "cuentarut"), setOf("chile", "mi", "app", "movil")),
        // La tarjeta CMR tiene su propia app («CMR Falabella»); sus avisos son del mismo banco. «CMR Puntos» y otros países quedan fuera.
        Rule("banco-falabella", setOf("bancofalabella", "cmr", "cmrfalabella", "micmr"), setOf("chile", "app", "movil")),
        // «chile» NO es palabra suelta aqui: forma parte del nombre («Banco de Chile»).
        Rule("banco-chile", setOf("bancodechile", "bancochile", "mibanco", "mipasaporte", "mipasaportebancodechile"), setOf("app", "movil")),
    )
    private val MARKS = Regex("\\p{M}")
    private val NON_ALNUM = Regex("[^a-z0-9]+")

    fun bankOf(label: String): String? {
        val tokens = NON_ALNUM.replace(MARKS.replace(Normalizer.normalize(label.lowercase(), Normalizer.Form.NFD), ""), " ").trim().split(' ').filter { it.isNotEmpty() }
        if (tokens.isEmpty()) return null
        return RULES.firstOrNull { r -> tokens.filterNot { it in r.extras }.joinToString("") in r.cores }?.bankId
    }
}

object BankDetector {
    /** [learned]: paquetes que la persona (o un aviso) asocio a cada banco. La propia app nunca cuenta. */
    fun detect(apps: List<InstalledApp>, learned: Map<String, Set<String>>, ownPackage: String): List<DetectedBank> {
        val candidates = apps.filter { it.packageName != ownPackage }
        val byPkg = candidates.associateBy { it.packageName }
        val out = ArrayList<DetectedBank>()
        val used = HashSet<String>()
        BankPresets.ALL.forEach { bank ->
            candidates.filter { BankMatcher.bankOf(it.label) == bank.id && used.add(it.packageName) }
                .forEach { out.add(DetectedBank(bank.id, it.label, it.packageName, DetectStatus.installed)) }
        }
        BankPresets.ALL.forEach { bank ->
            learned[bank.id].orEmpty().filter { it != ownPackage && used.add(it) }
                .forEach { out.add(DetectedBank(bank.id, byPkg[it]?.label, it, DetectStatus.seen)) }
        }
        val order = BankPresets.ALL.map { it.id }
        val withApp = out.map { it.bankId }.toSet()
        BankPresets.ALL.filter { it.id !in withApp }.forEach { out.add(DetectedBank(it.id, null, null, DetectStatus.not_found)) }
        return out.sortedBy { order.indexOf(it.bankId) }
    }
}

/** Lo que BankSetup necesita saber de cada banco (lo implementa CapturePrefs). */
interface BankStore {
    fun detectedPackages(bank: String): Set<String>

    fun manualPackage(bank: String): String?

    fun autoSave(bank: String): Boolean

    fun setAutoSave(bank: String, enabled: Boolean)
}

data class SetupResult(val enabled: List<String>, val disabled: List<String>, val withoutApp: List<String>)

/** Activacion en un paso: captura + guardado automatico para los bancos con app (detectada o asociada). Los topes no se tocan. */
class BankSetup(private val store: BankStore) {
    fun setAll(enabled: Boolean): SetupResult {
        val on = ArrayList<String>(); val off = ArrayList<String>(); val none = ArrayList<String>()
        BankPresets.ALL.forEach { b ->
            val hasApp = store.detectedPackages(b.id).isNotEmpty() || store.manualPackage(b.id) != null
            if (enabled) {
                if (hasApp) { store.setAutoSave(b.id, true); on.add(b.id) } else none.add(b.id)
            } else if (store.autoSave(b.id)) {
                store.setAutoSave(b.id, false); off.add(b.id)
            }
        }
        return SetupResult(on, off, none)
    }
}
