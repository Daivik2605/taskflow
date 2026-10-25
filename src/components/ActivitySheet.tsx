import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useConnection } from '../app/connection'
import { useToday } from '../app/useToday'
import { useActivities } from '../data/activities'
import { useAreas } from '../data/areas'
import { useSettings } from '../data/settings'
import { logMinutes, validateLog, weekLogs, type Activity } from '../lib/activities'
import { tagPath } from '../lib/tags'
import { formatDay, formatTime, dayOf, instantToTorontoLocal, parseDuration, torontoLocalToInstant } from '../lib/time'
import { btn, btnDanger, btnPrimary, input, label } from './ui'

/** Long-press / ▾ on an activity: log other minutes, at an earlier time or on another day, and see or delete this week's logs. Times are Toronto time. */
export function ActivitySheet({ activity, onClose }: { activity: Activity | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (activity && !d.open) d.showModal()
    if (!activity && d.open) d.close()
  }, [activity])

  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }} aria-label={activity ? `${activity.name} logs` : 'Activity'}
      className="m-0 mt-auto max-h-[92vh] w-full max-w-none overflow-y-auto rounded-t-2xl bg-white p-0 text-slate-900 backdrop:bg-black/40 dark:bg-slate-900 dark:text-slate-100 lg:m-auto lg:max-w-md lg:rounded-2xl">
      {activity && <SheetBody key={activity.id} activity={activity} onClose={onClose} />}
    </dialog>
  )
}

function SheetBody({ activity, onClose }: { activity: Activity; onClose: () => void }) {
  const { logs, log, removeLog } = useActivities()
  const { areas } = useAreas()
  const { weekStartsOn } = useSettings()
  const { writesDisabled } = useConnection()
  const today = useToday()
  const [minutes, setMinutes] = useState(String(activity.default_minutes))
  const [ended, setEnded] = useState(() => instantToTorontoLocal(new Date()))
  const [error, setError] = useState<string | null>(null)

  const week = weekLogs(logs, activity.id, today, weekStartsOn)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const m = parseDuration(minutes)
    let endedAt: Date
    try { endedAt = torontoLocalToInstant(ended) } catch { setError('Pick a date and time.'); return }
    const problem = validateLog(m ?? 0, endedAt, new Date())
    if (problem) { setError(problem); return }
    setError(null)
    if (await log(activity.id, { minutes: m!, endedAt })) { setEnded(instantToTorontoLocal(new Date())); setMinutes(String(activity.default_minutes)) }
  }

  return (
    <div className="space-y-5 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{activity.name}</h2>
          <p className="text-sm text-slate-500">{tagPath(areas, activity.area_id)} · {activity.default_minutes} min{activity.weekly_target ? ` · target ${activity.weekly_target} a week` : ''}</p>
        </div>
        <button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-lg text-xl" aria-label="Close">✕</button>
      </div>

      <form onSubmit={submit} noValidate className="space-y-3" aria-label="Log with other details">
        <h3 className="text-sm font-semibold text-slate-500">Log with other details</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>Minutes
            <input className={`${input} mt-1`} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </label>
          <label className={label}>Ended at (Toronto time)
            <input className={`${input} mt-1`} type="datetime-local" value={ended} onChange={(e) => setEnded(e.target.value)} />
          </label>
        </div>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button className={`${btnPrimary} w-full`} disabled={writesDisabled}>Log it</button>
      </form>

      <div>
        <h3 className="mb-1 text-sm font-semibold text-slate-500">This week · {week.length}</h3>
        {week.length === 0 ? <p className="text-sm text-slate-500">None this week.</p> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {week.map((l) => (
              <li key={l.id} className="flex items-center gap-2 py-1">
                <span className="flex-1 text-sm">{formatDay(dayOf(l.ended_at))} · ended {formatTime(l.ended_at)} · {logMinutes(l)} min</span>
                <button type="button" className={`${btnDanger} min-h-9 px-3`} disabled={writesDisabled} onClick={() => void removeLog(l.id)}
                  aria-label={`Delete log: ${formatDay(dayOf(l.ended_at))} ${formatTime(l.ended_at)}`}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end"><button type="button" className={btn} onClick={onClose}>Done</button></div>
    </div>
  )
}
