// The real Store: Supabase with the SERVICE-ROLE key. That key is injected by Supabase into Edge Functions and exists nowhere else
// (not in the app, not in this repo). Because it bypasses row-level security, EVERY query here filters by the token owner's user_id.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import type { Store, SessionRow } from './core.ts'

export function realStore(url: string, serviceRoleKey: string): Store {
  const sb: SupabaseClient = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const must = <T>(r: { data: T | null; error: { message: string } | null }): T => {
    if (r.error) throw new Error(r.error.message)
    return (r.data ?? ([] as unknown)) as T
  }
  const isDuplicate = (e: { code?: string } | null) => e?.code === '23505'

  return {
    async findToken(hash) {
      const { data, error } = await sb.from('taskflow_api_tokens').select('id,user_id,revoked_at').eq('token_hash', hash).maybeSingle()
      if (error) throw new Error(error.message)
      return data
    },
    async touchToken(id, at) { await sb.from('taskflow_api_tokens').update({ last_used_at: at }).eq('id', id) },
    async countRecent(tokenId, sinceIso) {
      const { count, error } = await sb.from('taskflow_api_log').select('id', { count: 'exact', head: true }).eq('token_id', tokenId).gte('at', sinceIso)
      if (error) throw new Error(error.message)
      return count ?? 0
    },
    async log(entry) { await sb.from('taskflow_api_log').insert(entry) },

    async counters(userId) { return must(await sb.from('taskflow_counters').select('id,name,short_label,archived').eq('user_id', userId)) },
    async addCounterEvent(userId, row) {
      // day is filled in by the table's trigger from `at` (Toronto date), exactly as for a tap in the app
      const { error } = await sb.from('taskflow_counter_events').insert({ ...row, user_id: userId })
      if (isDuplicate(error)) return false
      if (error) throw new Error(error.message)
      return true
    },
    async countToday(userId, counterId, day) {
      const rows = must(await sb.from('taskflow_counter_events').select('qty').eq('user_id', userId).eq('counter_id', counterId).eq('day', day)) as { qty: number }[]
      return rows.reduce((n, r) => n + r.qty, 0)
    },
    async addNote(userId, row) {
      const { error } = await sb.from('taskflow_notes').insert({ ...row, user_id: userId, kind: 'idea' })
      if (error && !isDuplicate(error)) throw new Error(error.message)
    },
    async areas(userId) { return must(await sb.from('taskflow_areas').select('id,name,parent_id,archived').eq('user_id', userId)) },
    async presets(userId) { return must(await sb.from('taskflow_presets').select('id,name,area_id,default_minutes,archived').eq('user_id', userId)) },
    async openTasks(userId) { return must(await sb.from('taskflow_tasks').select('id,title,area_id').eq('user_id', userId).in('status', ['todo', 'doing']).is('parent_id', null)) },

    async activeSession(userId) {
      const { data, error } = await sb.from('taskflow_sessions').select('id,area_id,task_id,state,comment,started_at').eq('user_id', userId).neq('state', 'stopped').limit(1).maybeSingle()
      if (error) throw new Error(error.message)
      if (!data) return null
      const segs = must(await sb.from('taskflow_session_segments').select('id,started_at,ended_at').eq('user_id', userId).eq('session_id', data.id).order('started_at'))
      return { ...data, segments: segs } as SessionRow
    },
    async startSession(userId, s) {
      const a = await sb.from('taskflow_sessions').insert({ id: s.id, user_id: userId, area_id: s.area_id, task_id: s.task_id, source: 'timer', comment: s.comment, started_at: s.started_at, state: 'running' })
      if (isDuplicate(a.error)) return false // the one-running-or-paused-timer index
      if (a.error) throw new Error(a.error.message)
      const b = await sb.from('taskflow_session_segments').insert({ id: s.segment_id, user_id: userId, session_id: s.id, started_at: s.started_at })
      if (b.error) { await sb.from('taskflow_sessions').delete().eq('id', s.id).eq('user_id', userId); throw new Error(b.error.message) }
      return true
    },
    async stopSession(userId, sessionId, endedAt, comment) {
      const a = await sb.from('taskflow_session_segments').update({ ended_at: endedAt }).eq('user_id', userId).eq('session_id', sessionId).is('ended_at', null)
      if (a.error) throw new Error(a.error.message)
      const last = must(await sb.from('taskflow_session_segments').select('ended_at').eq('user_id', userId).eq('session_id', sessionId).order('ended_at', { ascending: false }).limit(1)) as { ended_at: string }[]
      const patch: Record<string, unknown> = { state: 'stopped', ended_at: last[0]?.ended_at ?? endedAt }
      if (comment !== null) patch.comment = comment
      const b = await sb.from('taskflow_sessions').update(patch).eq('id', sessionId).eq('user_id', userId)
      if (b.error) throw new Error(b.error.message)
    },
    async logActivity(userId, row) {
      const a = await sb.from('taskflow_sessions').insert({ id: row.id, user_id: userId, area_id: row.area_id, source: 'preset', preset_id: row.preset_id, started_at: row.started_at, ended_at: row.ended_at, state: 'stopped' })
      if (isDuplicate(a.error)) return false
      if (a.error) throw new Error(a.error.message)
      const b = await sb.from('taskflow_session_segments').insert({ id: row.segment_id, user_id: userId, session_id: row.id, started_at: row.started_at, ended_at: row.ended_at })
      if (b.error) { await sb.from('taskflow_sessions').delete().eq('id', row.id).eq('user_id', userId); throw new Error(b.error.message) }
      return true
    },
  }
}
