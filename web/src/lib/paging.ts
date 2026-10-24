import type { PostgrestError } from '@supabase/supabase-js'

const PAGE = 1000

type Page<T> = PromiseLike<{ data: T[] | null; error: PostgrestError | null }>

/** El servidor corta cada consulta en 1.000 filas: se pide por páginas hasta agotar los datos (la consulta debe traer orden estable) */
export async function fetchAllPages<T>(page: (from: number, to: number) => Page<T>): Promise<{ data: T[] | null; error: PostgrestError | null }> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) return { data: null, error }
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < PAGE) return { data: rows, error: null }
  }
}
