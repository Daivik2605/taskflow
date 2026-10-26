// Timer reads, and the builders for timer writes. The writes themselves go through the offline queue (data/outbox.tsx),
// which sends them with data/syncExec.ts: every timer action is one idempotent `session.put` of the whole session
// (the session row plus its segments), so a replay or a retry can never double-count or half-apply.

import type { Op, SegmentRow, SessionRow } from '../lib/syncQueue'
import { fetchAll } from './db'
import type { Segment, Session } from '../lib/timer'

export type DbError = { code?: string; message: string }
type Row = Omit<Session, 'segments'>

export const SESSION_COLUMNS = 'id,area_id,task_id,source,preset_id,comment,started_at,ended_at,state'
export const SEGMENT_COLUMNS = 'id,session_id,started_at,ended_at'

/** Timer and manual sessions with their segments (activity-button sessions belong to the activities provider). */
export async function loadSessions(): Promise<{ data: Session[]; error: DbError | null }> {
  const [s, g] = await Promise.all([
    fetchAll<Row>('taskflow_sessions', SESSION_COLUMNS, 'started_at'),
    fetchAll<Segment>('taskflow_session_segments', SEGMENT_COLUMNS, 'started_at'),
  ])
  if (s.error) return { data: [], error: s.error }
  if (g.error) return { data: [], error: g.error }
  const by = new Map<string, Segment[]>()
  for (const seg of g.data) by.set(seg.session_id, [...(by.get(seg.session_id) ?? []), seg])
  return { data: s.data.filter((r) => r.source !== 'preset').map((r) => ({ ...r, segments: by.get(r.id) ?? [] })), error: null }
}

/** Start, pause, resume, stop, add-past, edit and comment all send the session's full state. `replaceSegments` when an edit changed the times. */
export function putOp(s: Session, opts: { replaceSegments?: boolean } = {}): Op {
  const session: SessionRow = { id: s.id, area_id: s.area_id, task_id: s.task_id, source: s.source, preset_id: s.preset_id, comment: s.comment, started_at: s.started_at, ended_at: s.ended_at, state: s.state }
  const segments: SegmentRow[] = s.segments.map((g) => ({ id: g.id, session_id: s.id, started_at: g.started_at, ended_at: g.ended_at }))
  return { kind: 'session.put', session, segments, ...(opts.replaceSegments ? { replaceSegments: true } : {}) }
}
export const removeOp = (id: string): Op => ({ kind: 'session.remove', id })
