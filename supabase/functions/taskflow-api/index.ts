// Supabase Edge Function `taskflow-api`: personal-token API for iPhone Shortcuts, Back Tap and Siri (SPEC §19).
// Deploy with --no-verify-jwt (a personal token is not a Supabase JWT; core.ts checks it). The service-role key comes from
// the environment Supabase sets for the function; it is used here, server-side, and nowhere else.
import { handle } from './core.ts'
import { realStore } from './store.ts'

const url = Deno.env.get('SUPABASE_URL')
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const store = url && key ? realStore(url, key) : null

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })

Deno.serve(async (request) => {
  if (!store) return json(500, { ok: false, say: 'The server is not set up.' })
  let body: unknown = {}
  if (request.method === 'POST') {
    const text = await request.text()
    if (text.trim()) {
      try { body = JSON.parse(text) } catch { return json(400, { ok: false, say: 'Send JSON.' }) }
    }
  }
  const headers: Record<string, string | undefined> = {}
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v })
  const res = await handle({ method: request.method, path: new URL(request.url).pathname, headers, body }, { store, now: () => new Date(), id: () => crypto.randomUUID() })
  return json(res.status, res.body)
})
