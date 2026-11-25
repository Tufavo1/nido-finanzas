import { supabase } from './supabase'
import { santiagoDay } from './format'
import { APP_NAME, VERSION } from './about'

/** Tablas del hogar que entran en el respaldo. La base ya entrega solo lo que esta persona puede ver. */
const TABLES = [
  'members',
  'categories',
  'debts',
  'debt_payments',
  'expenses',
  'recurring_expenses',
  'goals',
  'contributions',
  'salaries',
  'incomes',
  'profiles',
] as const

/** Orden de las tablas en el respaldo y al restaurarlo: las deudas antes que los gastos que apuntan a una tarjeta */
export const BACKUP_TABLES: readonly BackupTable[] = TABLES

/**
 * Gasto de un respaldo listo para volver a insertar: un respaldo viejo (sin medio de pago) queda como débito,
 * y la tarjeta solo se conserva si es una deuda que existe (si no, null).
 */
export function restoreExpenseRow(row: Record<string, unknown>, debtIds: ReadonlySet<string>): Record<string, unknown> {
  const card = row.payment_method === 'tarjeta'
  const debtId = typeof row.card_debt_id === 'string' && debtIds.has(row.card_debt_id) ? row.card_debt_id : null
  return { ...row, payment_method: card ? 'tarjeta' : 'debito', card_debt_id: card ? debtId : null }
}

export type BackupTable = (typeof TABLES)[number]
export type Backup = {
  app: string
  version: string
  exportedAt: string
  tables: Record<BackupTable, Record<string, unknown>[]>
}

const PAGE = 1000

/** Clave primaria de cada tabla: sin un orden estable, paginar puede repetir u omitir filas */
const ORDER: Record<BackupTable, string[]> = {
  members: ['household_id', 'user_id'],
  categories: ['id'],
  expenses: ['id'],
  recurring_expenses: ['id'],
  goals: ['id'],
  contributions: ['id'],
  debts: ['id'],
  debt_payments: ['id'],
  salaries: ['user_id'],
  incomes: ['id'],
  profiles: ['user_id'],
}

export async function readAll(table: BackupTable): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from(table).select('*')
    for (const col of ORDER[table]) query = query.order(col, { ascending: true })
    const { data, error } = await query.range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data as Record<string, unknown>[]))
    if (data.length < PAGE) return rows
  }
}

export async function buildBackup(): Promise<Backup> {
  const tables = {} as Backup['tables']
  for (const t of TABLES) tables[t] = await readAll(t)
  return { app: APP_NAME, version: VERSION, exportedAt: new Date().toISOString(), tables }
}

/** Evita que Excel o Sheets ejecuten una celda como fórmula ("=", "+", "-", "@") y escapa comillas y comas */
export function csvCell(value: unknown): string {
  let s = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

export function expensesCsv(backup: Backup): string {
  const cats = new Map(backup.tables.categories.map((c) => [c.id as string, c.name as string]))
  const who = new Map(backup.tables.members.map((m) => [m.user_id as string, m.display_name as string]))
  const head = ['Fecha', 'Monto (CLP)', 'Categoría', 'Detalle', 'Pagó', 'Tipo', 'Fijo']
  const lines = backup.tables.expenses
    .slice()
    .sort((a, b) => String(b.spent_on).localeCompare(String(a.spent_on)))
    .map((e) =>
      [
        e.spent_on,
        e.amount,
        cats.get(e.category_id as string) ?? '',
        e.note ?? '',
        who.get(e.paid_by as string) ?? '',
        e.shared ? 'Compartido' : 'Personal',
        e.recurring_id ? 'Sí' : 'No',
      ]
        .map(csvCell)
        .join(','),
    )
  // BOM para que Excel respete las tildes
  return `﻿${[head.join(','), ...lines].join('\r\n')}\r\n`
}

/** Descarga un archivo generado en este dispositivo; nada se sube a ningún servidor */
export function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const stamp = (d: Date = new Date()): string => santiagoDay(d)
