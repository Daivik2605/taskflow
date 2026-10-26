import { useState } from 'react'
import { useTimer } from '../data/timer'
import type { Session } from '../lib/timer'
import { instantToTorontoLocal, torontoLocalToInstant } from '../lib/time'
import { TagPicker } from './TagPicker'
import { TaskSelect } from './TaskSelect'
import { btn, btnPrimary, input, label } from './ui'

/** Edit a finished session: tag, task, comment and the start and end (changing the times makes it a single stretch). */
export function SessionEditor({ session, onDone }: { session: Session; onDone: () => void }) {
  const { edit } = useTimer()
  const [tag, setTag] = useState<string | null>(session.area_id)
  const [task, setTask] = useState<string | null>(session.task_id)
  const [comment, setComment] = useState(session.comment ?? '')
  const [start, setStart] = useState(instantToTorontoLocal(session.started_at))
  const [end, setEnd] = useState(session.ended_at ? instantToTorontoLocal(session.ended_at) : '')
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!tag) { setError('Pick a tag.'); return }
    let s: Date, e: Date
    try { s = torontoLocalToInstant(start); e = torontoLocalToInstant(end) } catch { setError('Pick a start and an end.'); return }
    const changed = s.toISOString() !== session.started_at || e.toISOString() !== session.ended_at
    const problem = await edit(session.id, { areaId: tag, taskId: task, comment: comment.trim() || null, ...(changed ? { start: s, end: e } : {}) })
    setError(problem)
    if (!problem) onDone()
  }

  return (
    <div className="space-y-3 border-t border-slate-100 p-3 dark:border-slate-800">
      <div className={label}><span className="mb-1 block">Tag</span><TagPicker value={tag} onChange={setTag} label="Session tag" /></div>
      <div className={label}><span className="mb-1 block">Task</span><TaskSelect value={task} onChange={setTask} keepId={session.task_id} label="Session task" /></div>
      <label className={label}>Comment<input className={`${input} mt-1`} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>Start (Toronto time)<input className={`${input} mt-1`} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className={label}>End<input className={`${input} mt-1`} type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
      </div>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className={btnPrimary} onClick={() => void save()}>Save</button>
        <button type="button" className={btn} onClick={onDone}>Cancel</button>
      </div>
    </div>
  )
}
