// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.capture

import org.json.JSONObject

/**
 * Los campos de un aviso tal como vienen en los extras de Android (ya pasados a texto), sin Android para poder probarlo.
 * Solo se construye para paquetes PERMITIDOS (RF-01): el servicio decide por paquete antes de leer nada.
 */
data class RawNotice(
    val title: String?,
    val text: String?,
    val bigText: String?,
    /** InboxStyle (EXTRA_TEXT_LINES). */
    val lines: List<String> = emptyList(),
    /** MessagingStyle (EXTRA_MESSAGES): solo el texto de cada mensaje, nunca el remitente. */
    val messages: List<String> = emptyList(),
    val subText: String? = null,
    val summaryText: String? = null,
    val groupSummary: Boolean = false,
    val ongoing: Boolean = false,
    val foregroundService: Boolean = false,
)

/**
 * Estructura de un aviso para el diagnostico: SOLO que campos traian contenido y su largo (caracteres; en lineas y mensajes, cuantos),
 * jamas el contenido. Permite a «Avisos que no pude leer» decir «llego sin monto en el titulo ni en el texto».
 */
data class NoticeShape(
    val title: Int = 0,
    val text: Int = 0,
    val bigText: Int = 0,
    val lines: Int = 0,
    val linesChars: Int = 0,
    val messages: Int = 0,
    val messagesChars: Int = 0,
    val subText: Int = 0,
    val summary: Int = 0,
    /** Algun campo se corto por el tope de largo. */
    val truncated: Boolean = false,
) {
    enum class Hint { EMPTY, ONLY_TITLE, ONLY_EXTRA_FIELDS, NO_AMOUNT_IN_TITLE_OR_TEXT }

    /** Nombres de los campos que traian contenido, en orden fijo. */
    fun fields(): List<String> = listOfNotNull(
        "title".takeIf { title > 0 }, "text".takeIf { text > 0 }, "bigText".takeIf { bigText > 0 }, "lines".takeIf { lines > 0 },
        "messages".takeIf { messages > 0 }, "subText".takeIf { subText > 0 }, "summary".takeIf { summary > 0 },
    )

    /** Pista para un aviso que NO se pudo leer como movimiento (solo tiene sentido junto al motivo del diagnostico). */
    fun hint(): Hint {
        val main = text > 0 || bigText > 0
        val extra = lines > 0 || messages > 0 || subText > 0 || summary > 0
        return when {
            title == 0 && !main && !extra -> Hint.EMPTY
            !main && !extra -> Hint.ONLY_TITLE
            title == 0 && !main -> Hint.ONLY_EXTRA_FIELDS
            else -> Hint.NO_AMOUNT_IN_TITLE_OR_TEXT
        }
    }

    fun toJson(): JSONObject = JSONObject().put("title", title).put("text", text).put("bigText", bigText).put("lines", lines).put("linesChars", linesChars)
        .put("messages", messages).put("messagesChars", messagesChars).put("subText", subText).put("summary", summary).put("truncated", truncated)

    companion object {
        fun fromJson(o: JSONObject): NoticeShape = NoticeShape(
            o.optInt("title"), o.optInt("text"), o.optInt("bigText"), o.optInt("lines"), o.optInt("linesChars"), o.optInt("messages"),
            o.optInt("messagesChars"), o.optInt("subText"), o.optInt("summary"), o.optBoolean("truncated"),
        )

        /** Para quien solo tiene titulo y texto (caminos antiguos). */
        fun of(title: String?, text: String?): NoticeShape = NoticeShape(title = title?.trim()?.length ?: 0, text = text?.trim()?.length ?: 0)
    }
}

/** Lo que entra al procesador: titulo y cuerpo ya con tope, y la estructura para el diagnostico. */
data class ExtractedNotice(val title: String?, val body: String?, val shape: NoticeShape)

/**
 * Elige el texto de un aviso. Orden: texto ampliado (BIG_TEXT), texto; si ambos vienen vacios, lineas (InboxStyle), mensajes
 * (MessagingStyle, los ultimos), subtexto y resumen. Todo con tope de largo. Nunca lanza.
 */
object NoticeExtractor {
    const val MAX_TEXT = 2_000
    private const val MAX_LINE = 500
    private const val MAX_LINES = 10
    private const val MAX_MESSAGES = 5

    enum class Skip { GROUP_SUMMARY, ONGOING }

    /**
     * Se mira ANTES de leer el texto (son banderas, no contenido): un resumen de grupo repite los avisos hijos (duplicaria) y un aviso
     * fijo o de servicio en primer plano no es un movimiento.
     */
    fun skipReason(raw: RawNotice): Skip? = when {
        raw.groupSummary -> Skip.GROUP_SUMMARY
        raw.ongoing || raw.foregroundService -> Skip.ONGOING
        else -> null
    }

    fun extract(raw: RawNotice): ExtractedNotice {
        var truncated = false
        fun cap(s: String?, max: Int = MAX_TEXT): String? {
            val t = s?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            if (t.length > max) truncated = true
            return t.take(max)
        }
        val lines = raw.lines.mapNotNull { it.trim().takeIf(String::isNotEmpty) }
        val messages = raw.messages.mapNotNull { it.trim().takeIf(String::isNotEmpty) }
        val title = cap(raw.title)
        val body = cap(raw.bigText) ?: cap(raw.text)
            ?: lines.take(MAX_LINES).mapNotNull { cap(it, MAX_LINE) }.joinToString("\n").ifEmpty { null }?.let { cap(it) }
            ?: messages.takeLast(MAX_MESSAGES).mapNotNull { cap(it, MAX_LINE) }.joinToString("\n").ifEmpty { null }?.let { cap(it) }
            ?: listOfNotNull(cap(raw.subText), cap(raw.summaryText)).joinToString(" ").ifEmpty { null }?.let { cap(it) }
        if (lines.size > MAX_LINES || messages.size > MAX_MESSAGES) truncated = true
        val shape = NoticeShape(
            title = len(raw.title), text = len(raw.text), bigText = len(raw.bigText),
            lines = lines.size, linesChars = lines.sumOf { it.length }, messages = messages.size, messagesChars = messages.sumOf { it.length },
            subText = len(raw.subText), summary = len(raw.summaryText), truncated = truncated,
        )
        return ExtractedNotice(title, body, shape)
    }

    private fun len(s: String?): Int = s?.trim()?.length ?: 0
}
