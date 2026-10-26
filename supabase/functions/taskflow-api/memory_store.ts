// In-memory Store for the tests. Like the real one, every call is scoped to one user id; two users live side by side.
import type { AreaRow, CounterRow, LogEntry, PresetRow, SessionRow, Store, TaskRow, TokenRow } from './core.ts'
import { torontoDay } from './core.ts'

export interface UserData {
  counters: CounterRow[]; areas: AreaRow[]; presets: PresetRow[]; tasks: TaskRow[]
  events: { id: string; counter_id: string; at: string; qty: number }[]
  notes: { id: string; title: string; body: string }[]
  sessions: (SessionRow & { source: string; ended_at: string | null; preset_id?: string })[]
}
export const emptyUser = (): UserData => ({ counters: [], areas: [], presets: [], tasks: [], events: [], notes: [], sessions: [] })

export function memoryStore(clock: () => Date = () => new Date()) {
  const users = new Map<string, UserData>()
  const tokens = new Map<string, TokenRow & { last_used_at: string | null }>() // by hash
  const logs: LogEntry[] & { at?: string }[] = []
  const logAt: string[] = []
  const u = (id: string) => { if (!users.has(id)) users.set(id, emptyUser()); return users.get(id)! }
  const store: Store = {
    findToken: async (h) => tokens.get(h) ?? null,
    touchToken: async (id, at) => { for (const t of tokens.values()) if (t.id === id) t.last_used_at = at },
    countRecent: async (tokenId, since) => logs.filter((l, i) => l.token_id === tokenId && logAt[i] >= since).length,
    log: async (e) => { logs.push(e); logAt.push(clock().toISOString()) },
    counters: async (id) => structuredClone(u(id).counters),
    addCounterEvent: async (id, row) => { const d = u(id); if (d.events.some((e) => e.id === row.id)) return false; d.events.push(row); return true },
    countToday: async (id, counterId, day) => u(id).events.filter((e) => e.counter_id === counterId && torontoDay(new Date(e.at)) === day).reduce((n, e) => n + e.qty, 0),
    addNote: async (id, row) => { u(id).notes.push(row) },
    areas: async (id) => structuredClone(u(id).areas),
    presets: async (id) => structuredClone(u(id).presets),
    openTasks: async (id) => structuredClone(u(id).tasks),
    activeSession: async (id) => { const s = u(id).sessions.find((x) => x.state !== 'stopped'); return s ? structuredClone(s) : null },
    startSession: async (id, s) => {
      const d = u(id)
      if (d.sessions.some((x) => x.state !== 'stopped')) return false
      d.sessions.push({ id: s.id, area_id: s.area_id, task_id: s.task_id, state: 'running', comment: s.comment, started_at: s.started_at, source: 'timer', ended_at: null, segments: [{ id: s.segment_id, started_at: s.started_at, ended_at: null }] })
      return true
    },
    stopSession: async (id, sessionId, endedAt, comment) => {
      const s = u(id).sessions.find((x) => x.id === sessionId)
      if (!s) return
      for (const g of s.segments) if (g.ended_at === null) g.ended_at = endedAt
      s.state = 'stopped'; s.ended_at = endedAt
      if (comment !== null) s.comment = comment
    },
    logActivity: async (id, row) => {
      const d = u(id)
      if (d.sessions.some((x) => x.id === row.id)) return false
      d.sessions.push({ id: row.id, area_id: row.area_id, task_id: null, state: 'stopped', comment: null, started_at: row.started_at, source: 'preset', preset_id: row.preset_id, ended_at: row.ended_at, segments: [{ id: row.segment_id, started_at: row.started_at, ended_at: row.ended_at }] })
      return true
    },
  }
  return {
    store, users, logs, tokens,
    user: u,
    /** Registers a token for a user; returns the secret to send. */
    async addToken(userId: string, secret: string, revoked = false) {
      const { sha256Hex } = await import('./core.ts')
      tokens.set(await sha256Hex(secret), { id: `tok-${secret.slice(-6)}`, user_id: userId, revoked_at: revoked ? '2026-11-01T00:00:00Z' : null, last_used_at: null })
      return secret
    },
  }
}
