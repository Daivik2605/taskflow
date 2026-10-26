// Sends one queued write to Supabase. Every handler is an upsert or a delete keyed on the client's id, so sending it twice
// (a replay after the app was closed mid-sync) changes nothing. Edits to rows that other devices can change (tasks, sessions)
// first look at the row's `updated_at` and apply the last-write-wins rule from lib/syncQueue.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import { isNetworkError, loses, type Op, type QItem, type RunResult } from '../lib/syncQueue'
import { kvGet, kvSet } from './offlineStore'

type Err = { code?: string; message: string; status?: number } | null

const result = (error: Err): RunResult | null => {
  if (!error) return null
  return isNetworkError(error) ? { status: 'network' } : { status: 'error', message: error.message }
}

/** `updated_at` we got back from our own last write to a row: our later queued edits to it are not "someone else's change". */
const ownKey = (table: string, id: string) => `own:${table}:${id}`

async function guarded(
  client: SupabaseClient, table: string, id: string, queuedAt: string,
  write: () => PromiseLike<{ data: { updated_at: string }[] | null; error: Err }>,
): Promise<RunResult> {
  const cur = await client.from(table).select('updated_at').eq('id', id).maybeSingle()
  const bad = result(cur.error as Err)
  if (bad) return bad
  const server = (cur.data as { updated_at: string } | null)?.updated_at ?? null
  if (loses(queuedAt, server, (await kvGet<string>(ownKey(table, id))) ?? null)) return { status: 'skipped', reason: `${table} ${id} was changed later elsewhere` }
  const w = await write()
  const err = result(w.error)
  if (err) return err
  const stamp = w.data?.[0]?.updated_at
  if (stamp) await kvSet(ownKey(table, id), stamp)
  return { status: 'ok' }
}

export async function execute(client: SupabaseClient, item: QItem): Promise<RunResult> {
  try {
    return await run(client, item.op, item.queuedAt)
  } catch (e) {
    const err = { message: e instanceof Error ? e.message : String(e) }
    return isNetworkError(err) ? { status: 'network' } : { status: 'error', message: err.message }
  }
}

async function run(client: SupabaseClient, op: Op, queuedAt: string): Promise<RunResult> {
  switch (op.kind) {
    case 'counter.tap': {
      const { error } = await client.from('taskflow_counter_events').upsert(op.row, { onConflict: 'id', ignoreDuplicates: true })
      return result(error) ?? { status: 'ok' }
    }
    case 'counter.update': {
      const { error } = await client.from('taskflow_counter_events').update(op.patch).eq('id', op.id)
      return result(error) ?? { status: 'ok' }
    }
    case 'counter.remove': {
      const { error } = await client.from('taskflow_counter_events').delete().eq('id', op.id)
      return result(error) ?? { status: 'ok' }
    }
    case 'activity.log': {
      const { error } = await client.rpc('taskflow_log_activity', { p_id: op.id, p_preset: op.preset, p_minutes: op.minutes, p_ended_at: op.ended_at })
      return result(error) ?? { status: 'ok' }
    }
    case 'session.remove': {
      const { error } = await client.from('taskflow_sessions').delete().eq('id', op.id)
      return result(error) ?? { status: 'ok' }
    }
    case 'session.put':
      return guarded(client, 'taskflow_sessions', op.session.id, queuedAt, async () => {
        const a = await client.from('taskflow_sessions').upsert(op.session, { onConflict: 'id' }).select('updated_at')
        if (a.error) return { data: null, error: a.error }
        if (op.replaceSegments) {
          const d = await client.from('taskflow_session_segments').delete().eq('session_id', op.session.id)
          if (d.error) return { data: null, error: d.error }
        }
        if (op.segments.length > 0) {
          const b = await client.from('taskflow_session_segments').upsert(op.segments, { onConflict: 'id' })
          if (b.error) return { data: null, error: b.error }
        }
        return { data: a.data as { updated_at: string }[], error: null }
      })
    case 'task.put':
      return guarded(client, 'taskflow_tasks', op.row.id, queuedAt, async () => client.from('taskflow_tasks').upsert(op.row, { onConflict: 'id' }).select('updated_at') as never)
    case 'task.patch':
      return guarded(client, 'taskflow_tasks', op.id, queuedAt, async () => client.from('taskflow_tasks').update(op.patch).eq('id', op.id).select('updated_at') as never)
    case 'task.remove': {
      const { error } = await client.from('taskflow_tasks').delete().eq('id', op.id)
      return result(error) ?? { status: 'ok' }
    }
  }
}
