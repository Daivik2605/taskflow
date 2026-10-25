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
