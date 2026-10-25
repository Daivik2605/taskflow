import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/** The data providers only mount behind AuthGate, which already guarantees a configured client. */
export function db(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return fallback
}

/** Missing table / column codes (Postgres 42P01 / 42703, PostgREST PGRST205 / PGRST204) mean the SQL hasn't been run yet. */
export const OUT_OF_DATE = 'The database is out of date — run supabase/taskflow_schema.sql in the Supabase SQL Editor.'
export function friendlyDbError(error: { code?: string; message: string }): string {
  return ['42P01', '42703', 'PGRST205', 'PGRST204'].includes(error.code ?? '') ? OUT_OF_DATE : error.message
}

const PAGE = 1000 // Supabase returns at most 1000 rows per request

/** Reads a whole table in pages, so a long history never silently stops at the first 1000 rows. */
export async function fetchAll<T>(table: string, columns: string, order: string): Promise<{ data: T[]; error: { code?: string; message: string } | null }> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db().from(table).select(columns).order(order).order('id').range(from, from + PAGE - 1)
    if (error) return { data: [], error }
    rows.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) return { data: rows, error: null }
  }
}
