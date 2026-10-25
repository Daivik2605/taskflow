import { useRef, useState } from 'react'
import { Icon } from '../app/Icon'
import { useConnection } from '../app/connection'
import { useToast } from '../app/toast'
import { useToday } from '../app/useToday'
import { useActivities } from '../data/activities'
import { useSettings } from '../data/settings'
import { activeActivities, doneToday, weekCount, weekLabel, type Activity } from '../lib/activities'
import { ActivitySheet } from './ActivitySheet'

const HOLD_MS = 500

/** SPEC §16: one button per activity under the overview. Tap = done now (a stopped session of the default minutes) with a 5-second Undo; long-press or ▾ = other minutes / earlier time / this week's logs. */
export function ActivityButtons() {
  const { activities, loading } = useActivities()
  const list = activeActivities(activities)
  if (loading || list.length === 0) return null
  return <Buttons list={list} />
}

function Buttons({ list }: { list: Activity[] }) {
  const { activities, logs, log, removeLog } = useActivities()
  const { writesDisabled } = useConnection()
  const { weekStartsOn } = useSettings()
  const toast = useToast()
  const today = useToday()
  const [sheetFor, setSheetFor] = useState<string | null>(null)
  const hold = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({ timer: null, fired: false })

  const doTap = (a: Activity) => {
    const id = crypto.randomUUID()
    void log(a.id, { id })
    toast.show(`${a.name} logged · ${a.default_minutes} min`, () => void removeLog(id), { actionLabel: 'Undo', timeoutMs: 5000 })
  }
  const startHold = (a: Activity) => {
    hold.current.fired = false
    hold.current.timer = setTimeout(() => { hold.current.fired = true; setSheetFor(a.id) }, HOLD_MS)
  }
  const stopHold = () => { if (hold.current.timer) clearTimeout(hold.current.timer); hold.current.timer = null }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Activities">
        {list.map((a) => {
          const done = doneToday(logs, a.id, today)
          const label = weekLabel(weekCount(logs, a.id, today, weekStartsOn), a.weekly_target)
          return (
            <div key={a.id} className="relative">
              <button
                type="button"
                disabled={writesDisabled}
                aria-label={`${a.name}: ${done ? 'done today' : 'not done today'}, ${label}. Tap to log ${a.default_minutes} minutes now, hold for other options`}
                onPointerDown={() => startHold(a)}
                onPointerUp={stopHold}
                onPointerLeave={stopHold}
                onPointerCancel={stopHold}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => { if (hold.current.fired) { hold.current.fired = false; return } doTap(a) }}
                className={`flex min-h-20 w-full touch-manipulation select-none flex-col items-start justify-center gap-0.5 rounded-xl border px-3 py-2 pr-9 text-left active:scale-[0.98] disabled:opacity-50 ${done ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}
                style={{ WebkitTouchCallout: 'none' }}
              >
                <span className="flex items-center gap-1 font-medium">{a.name}{done && <Icon name="check" className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}</span>
                <span className="text-xs text-slate-500">{a.default_minutes} min</span>
                <span className="text-xs text-slate-500">{label}</span>
              </button>
              <button type="button" aria-label={`More for ${a.name}: other minutes, earlier time, this week's logs`} onClick={() => setSheetFor(a.id)}
                className="absolute right-0 top-0 flex h-11 w-9 items-center justify-center text-xs text-slate-500"><span aria-hidden="true">▾</span></button>
            </div>
          )
        })}
      </div>
      <ActivitySheet activity={activities.find((a) => a.id === sheetFor) ?? null} onClose={() => setSheetFor(null)} />
    </>
  )
}
