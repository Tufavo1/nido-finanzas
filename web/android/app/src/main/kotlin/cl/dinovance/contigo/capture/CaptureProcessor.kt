// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import cl.nido.parser.Kind
import cl.nido.parser.NotificationParser
import cl.nido.parser.ParseRejection

enum class Outcome { IGNORED_PACKAGE, NO_SESSION, NOT_A_MOVEMENT, DUPLICATE, STORED, QUEUE_FULL, FAILED }

interface DraftNotifier {
    fun show(draft: Draft)

    fun cancel(draftId: String)

    /** La bandeja está llena y no se pudo guardar un gasto: hay que avisar a la persona, no perderlo en silencio. */
    fun queueFull() {}

    /** Un gasto se guardo solo (registro automatico): aviso discreto y recordatorio por si el envio no sale. */
    fun autoSaved(draft: Draft) = show(draft)
}

/** Lo que el servicio informa de su salud: sin datos personales ni montos. */
interface HealthRecorder {
    fun recordEvent(nowMillis: Long)

    fun recordFailure(errorClass: String, nowMillis: Long)
}

/**
 * Núcleo de la captura, sin Android para poder probarlo. Orden: lista blanca (antes de leer ningún texto),
 * parser, deduplicación, cola cifrada, notificación. Nada lanza hacia el servicio: ante un aviso malformado
 * se cuenta el fallo por nombre de clase y se sigue (NFR-01, estándares).
 */
class CaptureProcessor(
    private val whitelist: () -> Set<String>,
    private val repository: DraftRepository,
    private val notifier: DraftNotifier,
    private val health: HealthRecorder,
    private val clock: () -> Long,
    private val newId: () -> String,
    /** Paquete de la propia app: nunca se acepta, aunque esté en la lista (evita el bucle aviso -> captura -> aviso) (H-08). */
    private val ownPackage: String? = "cl.dinovance.contigo",
    /** Usuario/hogar activo; los borradores nacen con este dueño (H-06). */
    private val ownerProvider: () -> String? = { null },
    /** En producción sin sesión no se captura nada (no habría dueño al que mostrarlo). */
    private val requireOwner: Boolean = false,
    /** Registro automatico por banco (opt-in). Sin configuracion todo pide confirmacion. */
    private val auto: AutoConfig? = null,
    private val profile: () -> AutoProfile? = { null },
    /** Se llama tras guardar un gasto confirmado automaticamente: agenda el envio en segundo plano. */
    private val onAutoSaved: () -> Unit = {},
    private val autoLog: AutoSavedLog? = null,
    /** Diagnostico local (solo motivo y texto enmascarado) de avisos que no se aceptaron. */
    private val diag: DiagnosticsLog? = null,
    /** Permiso de notificaciones de Android: sin el, el gasto queda en la bandeja pero no se muestra el aviso propio. */
    private val notificationsAllowed: () -> Boolean = { true },
    /** Registro persistente (solo hashes) de avisos ya convertidos en borrador: deduplica reenvios aunque el proceso muera (ronda 5). */
    private val ledger: NoticeLedger? = null,
) {
    private class Stored(val fingerprint: String, val key: String, val amount: Long, var blankMerchant: Boolean, val draftId: String, val at: Long)

    // Solo recuerda lo GUARDADO; un descarte no renueva la ventana (H-04).
    private val recent = ArrayList<Stored>()

    /** RF-01: el servicio pregunta ANTES de leer el contenido del aviso. */
    fun accepts(packageName: String): Boolean = packageName != ownPackage && packageName in whitelist()

    fun process(packageName: String, title: String?, text: String?, postedAtMillis: Long): Outcome =
        process(IncomingNotice(packageName, title, text, postedAtMillis))

    @Synchronized
    fun process(notice: IncomingNotice): Outcome {
        val now = clock()
        return try {
            handle(notice, now)
        } catch (e: Throwable) {
            health.recordFailure(e.javaClass.simpleName, now)
            Outcome.FAILED
        }
    }

    private fun handle(n: IncomingNotice, now: Long): Outcome {
        val packageName = n.packageName
        val title = n.title
        val text = n.text
        val postedAtMillis = n.postedAtMillis
        val shape = n.shape ?: NoticeShape.of(title, text)
        if (!accepts(packageName)) return Outcome.IGNORED_PACKAGE
        val owner = ownerProvider()
        // Sin sesión no hay dueño: el aviso se guarda sin dueño (no se muestra a nadie) y se recupera al volver a iniciar
        // la misma sesión (R2-03). Siempre queda constancia en la salud del servicio.
        val orphan = requireOwner && owner == null
        val parser = NotificationParser(whitelist())
        val parsed = parser.parseDetailed(packageName, title, text, postedAtMillis)
        val candidate = parsed.candidate
        val bankId = auto?.bankOfPackage(packageName)
        val raw = listOfNotNull(title?.takeIf { it.isNotBlank() }, text).joinToString(" | ")
        if (candidate == null) {
            val reason = if (parsed.rejection == ParseRejection.DISCARDED) DiagReason.NOT_AN_EXPENSE else DiagReason.NO_AMOUNT
            diag(reason, bankId, raw, shape)
            return Outcome.NOT_A_MOVEMENT
        }
        // Pagos a tu tarjeta («Pagaste ... a tu CMR») y transferencias («Transferiste ... a NOMBRE») llegan a la bandeja pero NUNCA
        // se guardan solos: la persona decide a que deuda va o si fue gasto. Un ingreso («Recibiste») se guarda solo como ingreso
        // extra con las mismas barreras que un gasto.
        val isExpense = candidate.kind == Kind.EXPENSE
        // Solo la plata que te mandan («Recibiste»): un abono, devolucion o reversa es INCOME pero lo revisa la persona.
        val isIncome = candidate.kind == Kind.INCOME && parsed.extraIncome
        health.recordEvent(now)
        // (ronda 5) Mismo aviso reenviado o actualizado por el sistema: por clave + contenido + `when`, persistente y sin ventana de tiempo.
        val ids = NoticeIds.of(n, candidate.kind, candidate.amountClp)
        if (ids.identity != null && ledger?.has(ids.identity) == true) return Outcome.DUPLICATE
        if (sameNoticeUpdated(ids, n, candidate, orphan, now)) return Outcome.DUPLICATE
        // Reintento tras morir el proceso entre guardar y marcar: el MISMO aviso (misma huella y misma hora de publicacion) ya es un borrador
        if (repository.list().any { it.sourcePackage == packageName && it.postedAtMillis == postedAtMillis && it.candidate.fingerprint == candidate.fingerprint }) {
            remember(ids, n, "")
            return Outcome.DUPLICATE
        }
        recent.removeAll { now - it.at >= DEDUPE_WINDOW_MILLIS }
        val key = dedupeKey(candidate.kind, candidate.amountClp, candidate.merchant)
        // Mismo aviso repetido: misma huella o mismo monto y comercio a menos de 45 s de lo ULTIMO GUARDADO (el sistema reenvia
        // el aviso, p. ej. al cambiar de minuto). Se mide en segundos, no por el minuto de la huella (R2-01); no renueva la ventana.
        if (recent.any { (it.fingerprint == candidate.fingerprint || it.key == key) && now - it.at < SAME_NOTICE_WINDOW_MILLIS }) {
            diag(DiagReason.DUPLICATE, bankId, raw, shape)
            return Outcome.DUPLICATE
        }
        // Un cargo sin comercio que se actualiza con mas detalle completa SU borrador, una sola vez (H-14, R2-02).
        // Con otro comercio despues ya no se fusiona: son compras distintas.
        val refined = recent.firstOrNull { it.blankMerchant && it.amount == candidate.amountClp && candidate.merchant != null && isExpense && now - it.at < REFINE_WINDOW_MILLIS }
        if (refined != null) {
            val updated = repository.list().firstOrNull { it.id == refined.draftId }?.copy(candidate = candidate)
            if (updated != null && repository.update(refined.draftId) { updated }) {
                refined.blankMerchant = false
                if (!orphan) notifier.show(updated)
                return Outcome.DUPLICATE
            }
        }
        // Otro aviso igual pero dentro de 2 min: puede ser otro cafe. Se guarda marcado, la persona decide (H-04).
        val maybe = recent.any { it.key == key }
        // Registro automatico: banco asociado y activado, dentro del tope, confianza ALTA, gasto, categoria aprendida, dueno con
        // perfil vigente y sin duda de duplicado. Cualquier otra cosa pide confirmacion como siempre.
        val autoCategory = if (orphan || maybe || !isExpense) null else autoCategory(packageName, candidate, owner)
        val autoIncome = !orphan && !maybe && isIncome && autoIncome(packageName, candidate, owner)
        val saveAlone = autoCategory != null || autoIncome
        val draft = Draft(
            newId(), candidate, postedAtMillis, now, if (saveAlone) DraftStatus.CONFIRMED else DraftStatus.PENDING,
            packageName, owner, maybe, autoCategory, saveAlone,
        )
        if (!addOrMakeRoom(draft, owner)) {
            health.recordFailure("QueueFull", now)
            diag(DiagReason.QUEUE_FULL, bankId, raw, shape)
            notifier.queueFull()
            return Outcome.QUEUE_FULL
        }
        remember(ids, n, draft.id)
        recent.add(Stored(candidate.fingerprint, key, candidate.amountClp, isExpense && candidate.merchant.isNullOrBlank(), draft.id, now))
        while (recent.size > MAX_RECENT) recent.removeAt(0)
        if (orphan) {
            health.recordFailure("NoSession", now)
            diag(DiagReason.NO_SESSION, bankId, raw, shape)
            return Outcome.NO_SESSION
        }
        if (parsed.ambiguousAmount) diag(DiagReason.AMBIGUOUS_AMOUNT, bankId, raw, shape)
        if (draft.status == DraftStatus.PENDING && (isExpense || isIncome)) whyNotAuto(packageName, candidate, owner, maybe, bankId, raw)
        if (!notificationsAllowed()) diag(DiagReason.NOTIFICATIONS_OFF, bankId, raw, shape)
        if (draft.autoSaved) {
            val merchant = candidate.merchant?.trim().orEmpty()
            val note = if (isIncome) INCOME_SOURCE else merchant.ifEmpty { "Gasto" }
            autoLog?.add(AutoSavedEntry(draft.id.lowercase(), candidate.amountClp, note, now, false, owner, kind = candidate.kind))
            notifier.autoSaved(draft)
            onAutoSaved()
        } else {
            notifier.show(draft)
        }
        return Outcome.STORED
    }

    private fun diag(reason: DiagReason, bankId: String?, raw: String, shape: NoticeShape? = null) {
        try { diag?.add(reason, bankId, raw, shape) } catch (e: Exception) { health.recordFailure("DiagFailed", clock()) }
    }

    /** Resumenes del aviso: identidad (ranura + `when` + contenido), ranura (paquete + clave de Android) y monto. Solo hashes. */
    private class NoticeIds(val identity: String?, val slot: String?, val money: String) {
        companion object {
            fun of(n: IncomingNotice, kind: Kind, amount: Long): NoticeIds {
                val slot = n.key?.let { NoticeLedger.sha(n.packageName, it) }
                val stamp = if (n.whenMillis > 0) n.whenMillis else n.postedAtMillis
                val content = NoticeLedger.sha(n.packageName, NoticeLedger.contentOf(n.title, n.text))
                return NoticeIds(slot?.let { NoticeLedger.sha(it, stamp, content) }, slot, NoticeLedger.sha(kind.name, amount))
            }
        }
    }

    private fun remember(ids: NoticeIds, n: IncomingNotice, draftId: String) {
        val id = ids.identity ?: return
        try {
            ledger?.add(NoticeLedger.Entry(id, ids.slot.orEmpty(), ids.money, n.whenMillis, draftId, clock()))
        } catch (e: Exception) {
            health.recordFailure("LedgerFailed", clock())
        }
    }

    /**
     * La app actualizo el MISMO aviso (misma clave de Android y mismo monto, a menos de 10 min): si trae el mismo `when` es la misma
     * notificacion; si el borrador anterior no tenia comercio y este si, es el detalle que faltaba. Se completa el borrador (si aun
     * espera a la persona) en vez de crear otro. Un comercio distinto, otro monto u otro `when` con texto igual son avisos nuevos.
     */
    private fun sameNoticeUpdated(ids: NoticeIds, n: IncomingNotice, c: cl.nido.parser.ParsedCandidate, orphan: Boolean, now: Long): Boolean {
        val slot = ids.slot ?: return false
        val prev = ledger?.lastInSlot(slot, ids.money, now - SLOT_UPDATE_WINDOW_MILLIS) ?: return false
        val old = repository.list().firstOrNull { it.id == prev.draftId }
        val sameWhen = n.whenMillis > 0 && prev.whenMillis == n.whenMillis
        val oldBlank = old != null && old.candidate.merchant.isNullOrBlank() && !c.merchant.isNullOrBlank()
        if (!sameWhen && !oldBlank) return false
        if (old != null) {
            val om = old.candidate.merchant
            if (!om.isNullOrBlank() && !c.merchant.isNullOrBlank() && !om.equals(c.merchant, ignoreCase = true)) return false
            if (old.status == DraftStatus.PENDING) {
                val merged = old.candidate.copy(
                    merchant = om?.takeIf { it.isNotBlank() } ?: c.merchant,
                    confidence = if (om.isNullOrBlank() && !c.merchant.isNullOrBlank()) c.confidence else old.candidate.confidence,
                    installment = old.candidate.installment ?: c.installment,
                    account = old.candidate.account ?: c.account,
                )
                if (merged != old.candidate && repository.update(old.id) { it.copy(candidate = merged) }) {
                    recent.firstOrNull { it.draftId == old.id }?.blankMerchant = merged.merchant.isNullOrBlank()
                    if (!orphan) repository.list().firstOrNull { it.id == old.id }?.let(notifier::show)
                }
            }
        }
        remember(ids, n, prev.draftId)
        return true
    }

    /** Solo para bancos asociados: por que este gasto no se guardo solo (el primero que aplique). */
    private fun whyNotAuto(packageName: String, c: cl.nido.parser.ParsedCandidate, owner: String?, maybe: Boolean, bankId: String?, raw: String) {
        val cfg = auto ?: return
        if (bankId == null) return
        val p = profile()
        val reason = when {
            !cfg.autoEnabled(bankId) -> DiagReason.BANK_OFF
            maybe -> DiagReason.DUPLICATE
            p == null || owner == null || p.ownerKey != owner -> DiagReason.NO_PROFILE
            c.confidence != cl.nido.parser.Confidence.HIGH || (c.kind == Kind.EXPENSE && c.merchant.isNullOrBlank()) -> DiagReason.LOW_CONFIDENCE
            c.amountClp > cfg.maxClp() -> DiagReason.CAP_EXCEEDED
            c.kind == Kind.EXPENSE && (p.categoryFor(c.merchant) ?: p.defaultCategoryId) == null -> DiagReason.CATEGORY_UNKNOWN
            else -> return
        }
        diag(reason, bankId, raw)
    }

    /** Categoria con que el gasto se guarda solo: la aprendida del comercio o, si es nuevo, la general del perfil. null = preguntar. */
    private fun autoCategory(packageName: String, candidate: cl.nido.parser.ParsedCandidate, owner: String?): String? {
        val cfg = auto ?: return null
        val p = autoProfile(cfg, packageName, owner) ?: return null
        val category = p.categoryFor(candidate.merchant) ?: p.defaultCategoryId
        return if (decide(cfg, candidate, category != null)) category else null
    }

    /** Ingreso extra: mismas barreras (banco activado, perfil del dueno, confianza ALTA, tope), sin comercio ni categoria. */
    private fun autoIncome(packageName: String, candidate: cl.nido.parser.ParsedCandidate, owner: String?): Boolean {
        val cfg = auto ?: return false
        autoProfile(cfg, packageName, owner) ?: return false
        return decide(cfg, candidate, false)
    }

    private fun autoProfile(cfg: AutoConfig, packageName: String, owner: String?): AutoProfile? {
        val bank = cfg.bankOfPackage(packageName) ?: return null
        if (!cfg.autoEnabled(bank)) return null
        val p = profile() ?: return null
        return if (owner == null || p.ownerKey != owner) null else p
    }

    private fun decide(cfg: AutoConfig, candidate: cl.nido.parser.ParsedCandidate, hasCategory: Boolean): Boolean =
        cl.nido.parser.AutoCaptureRules.decide(candidate, cl.nido.parser.CaptureSettings(cl.nido.parser.CaptureMode.AUTO, cfg.maxClp()), hasCategory) ==
            cl.nido.parser.CaptureDecision.AUTO_SAVE

    // Si la bandeja esta llena se limpian SOLO borradores de otro dueno de hace mas de 30 dias (nadie los vera). Lo de la
    // persona activa, confirmado o no, jamas se borra (R2-04).
    private fun addOrMakeRoom(draft: Draft, owner: String?): Boolean {
        if (repository.add(draft)) return true
        val cutoff = clock() - FOREIGN_MAX_AGE_MILLIS
        if (repository.purge { it.ownerKey != owner && it.ownerKey != null && it.createdAtMillis < cutoff } == 0) return false
        return repository.add(draft)
    }

    private fun dedupeKey(kind: Kind, amountClp: Long, merchant: String?) = "${kind.name}|$amountClp|${merchant?.lowercase().orEmpty()}"

    companion object {
        const val DEDUPE_WINDOW_MILLIS = 2L * 60 * 1000
        private const val FOREIGN_MAX_AGE_MILLIS = 30L * 24 * 60 * 60 * 1000
        private const val SAME_NOTICE_WINDOW_MILLIS = 45_000L
        private const val REFINE_WINDOW_MILLIS = 30_000L
        private const val SLOT_UPDATE_WINDOW_MILLIS = 10L * 60 * 1000
        private const val MAX_RECENT = 200
        /** Rotulo del ingreso guardado solo; igual que INCOME_SOURCE de web/src/lib/movements.ts. */
        const val INCOME_SOURCE = "Ingreso extra"
    }
}
