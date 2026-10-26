// taskflow-api: the request logic, with no Supabase or Deno specifics so it can be tested directly.
// Authenticates a personal API token (stored hashed), rate-limits it, and runs one endpoint ONLY against the token owner's rows:
// every Store call below takes the owner's user id, and the real Store (store.ts) filters every query by it.

export const RATE_LIMIT_PER_MINUTE = 30
export const TIMEZONE = 'America/Toronto'

export interface TokenRow { id: string; user_id: string; revoked_at: string | null }
export interface CounterRow { id: string; name: string; short_label: string | null; archived: boolean }
export interface AreaRow { id: string; name: string; parent_id: string | null; archived: boolean }
export interface PresetRow { id: string; name: string; area_id: string; default_minutes: number; archived: boolean }
export interface TaskRow { id: string; title: string; area_id: string | null }
export interface SegmentRow { id: string; started_at: string; ended_at: string | null }
export interface SessionRow { id: string; area_id: string; task_id: string | null; state: string; comment: string | null; started_at: string; segments: SegmentRow[] }
export interface LogEntry { user_id: string; token_id: string; endpoint: string; ok: boolean; detail: string | null }

/** Everything the function reads or writes. Each method is for ONE user: implementations must never touch another user's rows. */
export interface Store {
  findToken(hash: string): Promise<TokenRow | null>
  touchToken(id: string, at: string): Promise<void>
  countRecent(tokenId: string, sinceIso: string): Promise<number>
  log(entry: LogEntry): Promise<void>
  counters(userId: string): Promise<CounterRow[]>
  /** false when a row with this id already exists (a repeated request). */
  addCounterEvent(userId: string, row: { id: string; counter_id: string; at: string; qty: number }): Promise<boolean>
  countToday(userId: string, counterId: string, day: string): Promise<number>
  addNote(userId: string, row: { id: string; title: string; body: string }): Promise<void>
  areas(userId: string): Promise<AreaRow[]>
  presets(userId: string): Promise<PresetRow[]>
  openTasks(userId: string): Promise<TaskRow[]>
  activeSession(userId: string): Promise<SessionRow | null>
  /** false when the one-running-timer rule refused it. */
  startSession(userId: string, s: { id: string; area_id: string; task_id: string | null; comment: string | null; started_at: string; segment_id: string }): Promise<boolean>
  stopSession(userId: string, sessionId: string, endedAt: string, comment: string | null): Promise<void>
  /** false when a log with this id already exists. */
  logActivity(userId: string, row: { id: string; preset_id: string; area_id: string; started_at: string; ended_at: string; segment_id: string }): Promise<boolean>
}

export interface Deps { store: Store; now: () => Date; id: () => string }
export interface Req { method: string; path: string; headers: Record<string, string | undefined>; body: unknown }
export interface Res { status: number; body: { ok: boolean; say: string; [k: string]: unknown } }

// ───────────── helpers ─────────────
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
/** The Toronto calendar date (YYYY-MM-DD) of a moment. */
export const torontoDay = (d: Date) => dayFmt.format(d)

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/s$/, '')

export type Match<T> = { ok: true; item: T } | { ok: false; say: string }

/** Finds one item by what was said: exact (name or short label), then a unique prefix, then a unique "contains". */
export function matchOne<T>(items: T[], query: string, names: (t: T) => string[], what: string): Match<T> {
  const q = norm(query)
  if (!q) return { ok: false, say: `Say which ${what}.` }
  const tiers: ((n: string) => boolean)[] = [(n) => n === q, (n) => n.startsWith(q), (n) => n.includes(q)]
  for (const test of tiers) {
    const hits = items.filter((t) => names(t).some((n) => n && test(norm(n))))
    if (hits.length === 1) return { ok: true, item: hits[0] }
    if (hits.length > 1) return { ok: false, say: `More than one ${what} matches ${query.trim()}. Be more specific.` }
  }
  return { ok: false, say: `I couldn't find a ${what} called ${query.trim()}.` }
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
/** "1 hour 20 minutes", "35 minutes", "under a minute": reads well when Siri says it. */
export function spokenDuration(ms: number): string {
  const total = Math.round(ms / 60_000)
  if (total < 1) return 'under a minute'
  const h = Math.floor(total / 60), m = total % 60
  return [h ? plural(h, 'hour') : '', m ? plural(m, 'minute') : ''].filter(Boolean).join(' ')
}

export function elapsedMs(s: SessionRow, now: Date): number {
  return s.segments.reduce((n, g) => n + Math.max(0, (g.ended_at ? Date.parse(g.ended_at) : now.getTime()) - Date.parse(g.started_at)), 0)
}

const bad = (say: string, status = 400): Res => ({ status, body: { ok: false, say } })
const good = (say: string, extra: Record<string, unknown> = {}): Res => ({ status: 200, body: { ok: true, say, ...extra } })

const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() && v.trim().length <= max ? v.trim() : null)
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const optId = (v: unknown, fallback: () => string): string | null => (v === undefined || v === null ? fallback() : typeof v === 'string' && uuidRe.test(v) ? v : null)

export function bearer(headers: Record<string, string | undefined>): string | null {
  const auth = headers['authorization'] ?? ''
  const m = /^Bearer\s+(\S+)$/i.exec(auth.trim())
  const t = m ? m[1] : (headers['x-taskflow-token'] ?? '').trim()
  return /^tfk_[A-Za-z0-9_-]{20,128}$/.test(t) ? t : null
}

export const ENDPOINTS = ['counter', 'capture', 'timer/start', 'timer/stop', 'activity/log'] as const
export type Endpoint = typeof ENDPOINTS[number]

/** `/functions/v1/taskflow-api/timer/start` → `timer/start`. */
export function endpointOf(path: string): string {
  const i = path.indexOf('taskflow-api')
  const rest = i >= 0 ? path.slice(i + 'taskflow-api'.length) : path
  return rest.replace(/^\/+|\/+$/g, '')
}

// ───────────── the request ─────────────
export async function handle(req: Req, deps: Deps): Promise<Res> {
  const { store } = deps
  if (req.method !== 'POST') return bad('Use POST.', 405)
  const endpoint = endpointOf(req.path)
  const token = bearer(req.headers)
  if (!token) return bad("That token isn't valid or was revoked.", 401)
  const row = await store.findToken(await sha256Hex(token))
  if (!row || row.revoked_at) return bad("That token isn't valid or was revoked.", 401)

  const now = deps.now()
  if (!(ENDPOINTS as readonly string[]).includes(endpoint)) {
    await store.log({ user_id: row.user_id, token_id: row.id, endpoint: endpoint.slice(0, 40) || '(none)', ok: false, detail: 'unknown endpoint' })
    return bad(`I don't know ${endpoint || 'that'}.`, 404)
  }
  if ((await store.countRecent(row.id, new Date(now.getTime() - 60_000).toISOString())) >= RATE_LIMIT_PER_MINUTE) {
    return bad('Too many requests. Wait a minute.', 429)
  }
  await store.touchToken(row.id, now.toISOString())

  let res: Res
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? (req.body as Record<string, unknown>) : {}
    res = await run(endpoint as Endpoint, row.user_id, body, deps, now)
  } catch (e) {
    res = { status: 500, body: { ok: false, say: 'Something went wrong on the server.', error: e instanceof Error ? e.message : String(e) } }
  }
  await store.log({ user_id: row.user_id, token_id: row.id, endpoint, ok: res.body.ok, detail: res.body.ok ? null : String(res.body.error ?? res.body.say).slice(0, 200) })
  if (res.body.error !== undefined) delete res.body.error // details stay in the log, never in the reply
  return res
}

async function run(endpoint: Endpoint, userId: string, b: Record<string, unknown>, deps: Deps, now: Date): Promise<Res> {
  const { store } = deps
  switch (endpoint) {
    case 'counter': {
      const name = str(b.name, 60)
      if (!name) return bad('Say which counter.')
      const qty = b.qty === undefined ? 1 : b.qty
      if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > 20) return bad('The quantity must be a whole number from 1 to 20.')
      const id = optId(b.id, deps.id)
      if (!id) return bad('The id must be a UUID.')
      const counters = (await store.counters(userId)).filter((c) => !c.archived)
      const m = matchOne(counters, name, (c) => [c.name, c.short_label ?? ''], 'counter')
      if (!m.ok) return bad(m.say, 404)
      await store.addCounterEvent(userId, { id, counter_id: m.item.id, at: now.toISOString(), qty }) // a repeated id is a no-op
      const count = await store.countToday(userId, m.item.id, torontoDay(now))
      return good(`${m.item.name} ${count} today`, { counter: m.item.name, count })
    }
    case 'capture': {
      const text = str(b.text, 2000)
      if (!text) return bad('Say what to save.')
      const id = optId(b.id, deps.id)
      if (!id) return bad('The id must be a UUID.')
      const firstLine = text.split('\n')[0].trim()
      const title = firstLine.length > 200 ? `${firstLine.slice(0, 197)}...` : firstLine
      await store.addNote(userId, { id, title, body: text === title ? '' : text })
      return good('Saved to your inbox')
    }
    case 'timer/start': {
      const active = await store.activeSession(userId)
      const areas = (await store.areas(userId)).filter((a) => !a.archived)
      if (active) {
        const tag = areas.find((a) => a.id === active.area_id)?.name ?? 'a tag'
        return bad(`A timer is already ${active.state === 'paused' ? 'paused' : 'running'} on ${tag}. Stop it first.`, 409)
      }
      const preset = str(b.preset, 60), tagName = str(b.tag, 60), taskName = str(b.task, 120)
      if (!preset && !tagName && !taskName) return bad('Say a preset, a tag or a task.')
      let areaId: string | null = null, taskId: string | null = null, taskTitle: string | null = null
      let comment = str(b.comment, 500)
      if (preset) {
        const m = matchOne((await store.presets(userId)).filter((p) => !p.archived), preset, (p) => [p.name], 'preset')
        if (!m.ok) return bad(m.say, 404)
        areaId = m.item.area_id
        comment ??= m.item.name
      }
      if (taskName) {
        const m = matchOne(await store.openTasks(userId), taskName, (t) => [t.title], 'task')
        if (!m.ok) return bad(m.say, 404)
        taskId = m.item.id; taskTitle = m.item.title
        areaId ??= m.item.area_id
      }
      if (tagName) {
        const m = matchOne(areas, tagName, (a) => [a.name], 'tag')
        if (!m.ok) return bad(m.say, 404)
        areaId = m.item.id
      }
      if (!areaId || !areas.some((a) => a.id === areaId)) return bad('That has no tag. Say which tag to count the time on.')
      const ok = await store.startSession(userId, { id: deps.id(), segment_id: deps.id(), area_id: areaId, task_id: taskId, comment, started_at: now.toISOString() })
      if (!ok) return bad('A timer is already running. Stop it first.', 409)
      const tag = areas.find((a) => a.id === areaId)!.name
      return good(taskTitle ? `Timer started on ${taskTitle}, ${tag}` : `Timer started on ${tag}`, { tag })
    }
    case 'timer/stop': {
      const s = await store.activeSession(userId)
      if (!s) return bad('No timer is running.', 409)
      const comment = b.comment === undefined ? null : str(b.comment, 500)
      if (b.comment !== undefined && comment === null) return bad('The comment must be text of at most 500 characters.')
      const tag = (await store.areas(userId)).find((a) => a.id === s.area_id)?.name ?? 'the timer'
      const worked = elapsedMs(s, now)
      await store.stopSession(userId, s.id, now.toISOString(), comment)
      return good(`Stopped ${tag}, ${spokenDuration(worked)}`, { tag, minutes: Math.round(worked / 60_000) })
    }
    case 'activity/log': {
      const name = str(b.name, 60)
      if (!name) return bad('Say which activity.')
      const id = optId(b.id, deps.id)
      if (!id) return bad('The id must be a UUID.')
      const m = matchOne((await store.presets(userId)).filter((p) => !p.archived), name, (p) => [p.name], 'activity')
      if (!m.ok) return bad(m.say, 404)
      const minutes = b.minutes === undefined ? m.item.default_minutes : b.minutes
      if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return bad('Minutes must be a whole number from 1 to 1440.')
      await store.logActivity(userId, { id, preset_id: m.item.id, area_id: m.item.area_id, segment_id: deps.id(), ended_at: now.toISOString(), started_at: new Date(now.getTime() - minutes * 60_000).toISOString() })
      return good(`${m.item.name} logged, ${plural(minutes, 'minute')}`, { activity: m.item.name, minutes })
    }
  }
}
