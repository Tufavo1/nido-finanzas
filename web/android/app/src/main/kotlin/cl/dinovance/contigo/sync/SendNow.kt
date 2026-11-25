// Copyright (c) 2026 Dinovance
package cl.dinovance.contigo.sync

import java.util.concurrent.Executor
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Respuesta de «Enviar ahora» (`syncNow`) para la app: solo cuentas y un codigo, ningun monto ni comercio.
 * [result] = nombre de [SyncResult], [SendNow.FAILED] (el envio lanzo) o [SendNow.IN_PROGRESS] (paso el tope y sigue en curso).
 * [scheduleBackground] = hay que dejar agendado el envio en segundo plano (no va a la app).
 */
data class SendNowReply(val sent: Int, val failed: Int, val needsPerson: Int, val result: String, val scheduleBackground: Boolean)

object SendNow {
    /** El envio lanzo una excepcion: no se sabe que salio; queda agendado en segundo plano. */
    const val FAILED = "FAILED"
    /** Paso el tope y el envio sigue en curso: la app vuelve a leer la bandeja; queda agendado en segundo plano por si acaso. */
    const val IN_PROGRESS = "IN_PROGRESS"
    /** Tope de espera de la app por «Enviar ahora» (igual al tope de cada peticion HTTP del envio). */
    const val DEADLINE_MILLIS = 20_000L

    /** null = el envio fallo. Jamas un exito mudo: lo que no salio queda en [SendNowReply.failed] o en el segundo plano. */
    fun reply(report: SyncReport?): SendNowReply =
        if (report == null) SendNowReply(0, 0, 0, FAILED, scheduleBackground = true)
        else SendNowReply(report.sent, report.failed, report.needsPerson, report.result.name, report.result.retriesInBackground)

    val inProgress = SendNowReply(0, 0, 0, IN_PROGRESS, scheduleBackground = true)
}

/**
 * Corre «Enviar ahora» en [worker] (nunca en el hilo del puente de Capacitor ni en el principal) y responde UNA sola vez: con las
 * cuentas del envio o, si pasa [deadlineMillis], con [SendNow.inProgress]. El envio en curso no se corta: sigue bajo el cerrojo
 * del envio y el trabajo agendado lo retoma si hace falta (el cerrojo impide que se crucen).
 */
class SendNowRunner(
    private val worker: Executor,
    private val timer: ScheduledExecutorService,
    private val deadlineMillis: Long = SendNow.DEADLINE_MILLIS,
) {
    /**
     * [schedule] agenda el envio en segundo plano; [onError] recibe SOLO el nombre de la clase del fallo (jamas el mensaje, que
     * podria traer datos); [reply] recibe la respuesta una sola vez.
     */
    fun start(sync: () -> SyncReport, schedule: () -> Unit, onError: (String) -> Unit, reply: (SendNowReply) -> Unit) {
        val answered = AtomicBoolean(false)
        val timeout: ScheduledFuture<*> = timer.schedule({
            if (answered.compareAndSet(false, true)) {
                schedule()
                reply(SendNow.inProgress)
            }
        }, deadlineMillis, TimeUnit.MILLISECONDS)
        worker.execute {
            val report = try {
                sync()
            } catch (e: Exception) {
                onError(e.javaClass.simpleName)
                null
            }
            val out = SendNow.reply(report)
            if (out.scheduleBackground) schedule()
            if (answered.compareAndSet(false, true)) {
                timeout.cancel(false)
                reply(out)
            }
        }
    }
}
