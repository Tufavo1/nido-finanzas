import { useState } from 'react'
import { buildBackup, download, expensesCsv, stamp } from '../lib/backup'
import { useToastError } from '../lib/useToastError'
import type { Notify } from './Toast'

/** Descarga de una copia de los datos del hogar. Se arma en este dispositivo: nada se envía a terceros. */
export default function BackupCard({ onToast }: { onToast: Notify }) {
  const [busy, setBusy] = useState<'json' | 'csv' | null>(null)
  const setError = useToastError(onToast)

  async function run(kind: 'json' | 'csv') {
    setBusy(kind)
    setError(null)
    try {
      const b = await buildBackup()
      const count = Object.values(b.tables).reduce((s, rows) => s + rows.length, 0)
      if (kind === 'json') {
        download(`contigo-respaldo-${stamp()}.json`, JSON.stringify(b, null, 2), 'application/json')
        onToast(`Respaldo descargado\nSe guardaron **${count} registros** en un archivo de tu dispositivo.`)
      } else {
        download(`contigo-gastos-${stamp()}.csv`, expensesCsv(b), 'text/csv;charset=utf-8')
        onToast(`Gastos exportados\nSe descargaron **${b.tables.expenses.length} gastos** listos para Excel.`)
      }
    } catch (e) {
      console.error(e)
      setError('No se pudo armar el respaldo. Revisa tu conexión e intenta de nuevo.')
    }
    setBusy(null)
  }

  return (
    <section className="card">
      <strong>Tu copia de seguridad</strong>
      <span className="muted">
        Descarga todos tus datos a este dispositivo: gastos, categorías, metas, aportes, deudas, pagos y gastos fijos. Hazlo de vez en cuando; así tienes tu información aunque algo falle.
      </span>
      <div className="stack tight">
        <button type="button" className="btn small" disabled={busy !== null} onClick={() => void run('json')}>
          {busy === 'json' ? 'Preparando…' : 'Descargar respaldo completo (.json)'}
        </button>
        <button type="button" className="btn ghost small" disabled={busy !== null} onClick={() => void run('csv')}>
          {busy === 'csv' ? 'Preparando…' : 'Descargar solo los gastos (.csv para Excel)'}
        </button>
      </div>
      <span className="hint">
        El archivo incluye tu sueldo e ingresos, que son privados: guárdalo en un lugar seguro y no lo compartas.
      </span>
    </section>
  )
}
