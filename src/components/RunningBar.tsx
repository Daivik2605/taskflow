import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useNow } from '../app/useNow'
import { useAreas } from '../data/areas'
import { useSettings } from '../data/settings'
import { useTasks } from '../data/tasks'
import { useTimer } from '../data/timer'
import { clock, elapsedMs, openSegment, stillGoing, validateEndedAt } from '../lib/timer'
import { tagPath } from '../lib/tags'
import { instantToTorontoLocal, torontoLocalToInstant } from '../lib/time'
import { btn, btnPrimary, input } from './ui'

const SNOOZE_MS = 60 * 60_000

/** The running timer on every screen: tag, task, a live clock, Pause/Resume and Stop (with a comment). After N hours it asks "Still going?". */
export function RunningBar() {
  const { active } = useTimer()
  return active ? <Bar /> : null
}

function Bar() {
  const { active, pause, resume, stop } = useTimer()
  const { areas } = useAreas()
  const { tasks } = useTasks()
  const { stillGoingHours } = useSettings()
  const now = useNow(1000)
  const [stopping, setStopping] = useState(false)
  const [comment, setComment] = useState('')
  const [ended, setEnded] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [snoozeUntil, setSnoozeUntil] = useState(0)

  if (!active) return null // (never: RunningBar only mounts this with a timer)
  const task = tasks.find((t) => t.id === active.task_id)
  const paused = active.state === 'paused'
  const asking = !stopping && now.getTime() >= snoozeUntil && stillGoing(active, now, stillGoingHours)

  const openStop = () => { setComment(active.comment ?? ''); setEnded(instantToTorontoLocal(new Date())); setError(null); setStopping(true) }
  const doStop = async (useEnded: boolean) => {
    let endedAt: Date | undefined
    if (useEnded) {
      try { endedAt = torontoLocalToInstant(ended) } catch { setError('Pick a date and time.'); return }
      const problem = validateEndedAt(active, endedAt, new Date())
      if (problem) { setError(problem); return }
    }
    if (await stop({ endedAt, comment })) setStopping(false)
  }

  return (
    <section aria-label="Running timer" className="border-b border-indigo-200 bg-indigo-50 px-3 py-2 dark:border-indigo-900 dark:bg-indigo-950 lg:px-8">
      <div className="flex items-center gap-2">
        <Link to="/timer" className="min-w-0 flex-1" aria-label="Open the timer">
          <span className="block truncate text-sm font-medium">{task ? task.title : tagPath(areas, active.area_id)}</span>
          <span className="block truncate text-xs text-slate-600 dark:text-slate-400">{task ? tagPath(areas, active.area_id) : paused ? 'Paused' : 'Running'}{task && paused ? ' · Paused' : ''}</span>
        </Link>
        <span className={`text-lg font-bold tabular-nums ${paused ? 'text-slate-500' : ''}`} role="timer" aria-label={`Elapsed ${clock(elapsedMs(active, now))}`}>{clock(elapsedMs(active, now))}</span>
        <button type="button" className={`${btn} min-h-10 px-3`} onClick={() => void (paused ? resume() : pause())}>{paused ? 'Resume' : 'Pause'}</button>
        <button type="button" className={`${btnPrimary} min-h-10 px-3`} onClick={openStop}>Stop</button>
      </div>

      {asking && (
        <div role="alert" className="mt-2 space-y-2 rounded-lg bg-white p-3 text-sm dark:bg-slate-900">
          <p className="font-medium">Still going? This has been running since {instantToTorontoLocal(openSegment(active)!.started_at).slice(11)}.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} onClick={() => setSnoozeUntil(now.getTime() + SNOOZE_MS)}>Yes, keep going</button>
            <button type="button" className={btnPrimary} onClick={openStop}>It ended at…</button>
          </div>
        </div>
      )}

      {stopping && (
        <div role="group" aria-label="Stop the timer" className="mt-2 space-y-2 rounded-lg bg-white p-3 dark:bg-slate-900">
          <input className={input} aria-label="Comment" placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <label className="block text-sm font-medium">It ended at (Toronto time)
            <input className={`${input} mt-1`} type="datetime-local" value={ended} onChange={(e) => setEnded(e.target.value)} />
          </label>
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnPrimary} onClick={() => void doStop(false)}>Stop now</button>
            <button type="button" className={btn} onClick={() => void doStop(true)}>Stop at that time</button>
            <button type="button" className={btn} onClick={() => setStopping(false)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  )
}
