// Personal API tokens for the taskflow-api Edge Function (SPEC §19). The app makes the token, stores only its SHA-256, and shows
// the token once. The same hash is computed server-side (supabase/functions/taskflow-api/core.ts `sha256Hex`).

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'

/** `tfk_` + 43 random URL-safe characters (256 bits). */
export function generateToken(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(43)
  let out = 'tfk_'
  for (const b of bytes) out += ALPHABET[b & 63]
  return out
}

export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** What the list shows to recognise a token without revealing it: `tfk_Ab12…`. */
export const tokenPrefix = (token: string) => `${token.slice(0, 8)}…`

export const isTokenName = (name: string) => name.trim().length > 0 && name.trim().length <= 60

/** Where the iPhone Shortcuts send requests. */
export function apiBaseUrl(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/taskflow-api`
}

export interface ApiToken { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null }
export interface ApiLogRow { id: string; endpoint: string; at: string; ok: boolean; detail: string | null }
