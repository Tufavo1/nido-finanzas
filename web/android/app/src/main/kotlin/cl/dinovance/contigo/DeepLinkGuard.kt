// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo

import android.content.Intent
import cl.nido.parser.ExpenseLink
import cl.nido.parser.ExpenseLinkParser
import java.util.Calendar

/**
 * Filtro de enlaces profundos usando la MISMA validacion del nucleo compartido (cl.nido.parser.ExpenseLinkParser).
 * Un nido:// invalido se quita del intent antes de llegar a la WebView; el TypeScript lo vuelve a validar (segunda capa).
 */
object DeepLinkGuard {
    fun isAcceptable(url: String, year: Int, month: Int, day: Int): Boolean = ExpenseLinkParser.parse(url, year, month, day) is ExpenseLink.Valid

    fun sanitize(intent: Intent?) {
        val url = intent?.dataString ?: return
        val today = Calendar.getInstance()
        val ok = isAcceptable(url, today.get(Calendar.YEAR), today.get(Calendar.MONTH) + 1, today.get(Calendar.DAY_OF_MONTH))
        if (!ok) intent.data = null
    }
}
