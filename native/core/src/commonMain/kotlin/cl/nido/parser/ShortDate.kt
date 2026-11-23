// Copyright (c) 2026 Dinovance
package cl.nido.parser

/**
 * Fecha corta que algunos avisos traen en el texto («23 nov», «23 de nov.», «5 SEPT», «hoy», «ayer») y horas («14:35»).
 * NO reemplaza la hora del aviso (Notification.postTime es la fuente confiable): sirve para quitarla del comercio y para notar un aviso
 * VIEJO reentregado (la fecha del texto cae a mas de [TOLERANCE_MILLIS] del dia de postTime). Se busca en texto plegado
 * ([TextNormalizer.fold], misma longitud que el original, asi las posiciones valen para el texto original).
 */
internal object ShortDate {
    private const val DAY = 24L * 60 * 60 * 1000
    /** Margen alrededor del dia del texto (zona horaria, avisos de medianoche, «ayer»). */
    const val TOLERANCE_MILLIS = 36L * 60 * 60 * 1000

    private const val MONTHS =
        "ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sept?(?:iembre)?|set(?:iembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?"
    private val DAY_MONTH = Regex("\\b(\\d{1,2})(?:\\s+de)?\\s*($MONTHS)\\b\\.?(?:,?\\s+(?:de\\s+)?(\\d{4})\\b)?")
    private val RELATIVE = Regex("\\b(?:hoy|ayer)\\b")
    private val TIME = Regex("\\b\\d{1,2}:\\d{2}(?:\\s*(?:hrs?|h|am|pm)\\b)?")

    private data class Found(val range: IntRange, val day: Int, val month: Int, val year: Int?)

    /** Posiciones de fechas y horas en [folded] (para sacarlas del comercio). */
    fun ranges(folded: String): List<IntRange> =
        days(folded).map { it.range } + RELATIVE.findAll(folded).map { it.range } + TIME.findAll(folded).map { it.range }

    /**
     * true si la primera fecha «dia mes» del texto queda a mas de 36 h del dia que dice (antes de su inicio o despues de su fin), medido
     * contra [postedAtMillis] con la zona [utcOffsetMillis]. Sin año, se elige el año que deja la fecha mas cerca de postTime. Sin fecha
     * (o con «hoy»/«ayer») nunca es viejo.
     */
    fun isStale(folded: String, postedAtMillis: Long, utcOffsetMillis: Long): Boolean {
        val f = days(folded).firstOrNull() ?: return false
        val today = (postedAtMillis + utcOffsetMillis).floorDiv(DAY)
        val years = f.year?.let { listOf(it) } ?: yearOf(today).let { listOf(it - 1, it, it + 1) }
        val dayIndex = years.filter { valid(it, f.month, f.day) }.map { daysFromCivil(it, f.month, f.day) }.minByOrNull { kotlin.math.abs(it - today) } ?: return false
        val start = dayIndex * DAY - utcOffsetMillis
        return postedAtMillis < start - TOLERANCE_MILLIS || postedAtMillis > start + DAY + TOLERANCE_MILLIS
    }

    private fun days(folded: String): List<Found> = DAY_MONTH.findAll(folded).mapNotNull { m ->
        val day = m.groupValues[1].toInt()
        val month = monthOf(m.groupValues[2]) ?: return@mapNotNull null
        val year = m.groupValues[3].takeIf { it.isNotEmpty() }?.toInt()
        if (day !in 1..31 || (year != null && !valid(year, month, day))) null else Found(m.range, day, month, year)
    }.toList()

    private fun monthOf(word: String): Int? = when (word.take(3)) {
        "ene" -> 1; "feb" -> 2; "mar" -> 3; "abr" -> 4; "may" -> 5; "jun" -> 6; "jul" -> 7; "ago" -> 8
        "sep", "set" -> 9; "oct" -> 10; "nov" -> 11; "dic" -> 12
        else -> null
    }

    private fun valid(y: Int, m: Int, d: Int): Boolean {
        val next = if (m == 12) daysFromCivil(y + 1, 1, 1) else daysFromCivil(y, m + 1, 1)
        return d in 1..(next - daysFromCivil(y, m, 1)).toInt()
    }

    // Dias desde 1970-01-01 del calendario gregoriano (algoritmo de H. Hinnant), sin java.time (no existe en common).
    private fun daysFromCivil(year: Int, m: Int, d: Int): Long {
        val y = (if (m <= 2) year - 1 else year).toLong()
        val era = (y).floorDiv(400L)
        val yoe = y - era * 400
        val mp = (m + 9) % 12
        val doy = (153 * mp + 2) / 5 + d - 1
        val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146_097 + doe - 719_468
    }

    private fun yearOf(days: Long): Int {
        val z = days + 719_468
        val era = (z).floorDiv(146_097L)
        val doe = z - era * 146_097
        val yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365
        val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        val mp = (5 * doy + 2) / 153
        val m = if (mp < 10) mp + 3 else mp - 9
        return (yoe + era * 400 + if (m <= 2) 1 else 0).toInt()
    }
}
