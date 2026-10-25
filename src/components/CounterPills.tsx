import { useRef, useState } from 'react'
import { useConnection } from '../app/connection'
import { useNow } from '../app/useNow'
import { useToast } from '../app/toast'
import { useToday } from '../app/useToday'
import { useCounters } from '../data/counters'
import { useGoalInputs } from '../data/goalInputs'
import { useGoals } from '../data/goals'
import { activeCounters, counterLabel, forCounter, totalBetween, type Counter } from '../lib/counters'
import { counterLimit, type CounterLimit } from '../lib/goals'
import { CounterSheet } from './CounterSheet'

const HOLD_MS = 500

const REASON_TOAST_MS = 8000

/** The pill's look for today against the counter's "at most" goal: amber at the limit, red over it (the numbers say the same, so colour is never the only cue). */
const LIMIT_STYLE: Record<'at' | 'over', string> = {
  at: 'border-amber-500 bg-amber-100 text-amber-900 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-200',
  over: 'border-red-600 bg-red-100 text-red-900 dark:border-red-500 dark:bg-red-950 dark:text-red-200',
}
const PERIOD_SHORT = { day: '', week: ' wk', month: ' mo' } as const

function limitText(l: CounterLimit): string {
  if (l.state === 'none' || l.limit === null || l.period === null) return ''
  return `${l.count}/${l.limit}${PERIOD_SHORT[l.period]}`
}

function limitAria(c: Counter, count: number, l: CounterLimit): string {
  if (l.state === 'none' || l.limit === null || l.period === null) return `${c.name}: ${count} today.`
  const status = l.state === 'over' ? 'over the limit' : l.state === 'at' ? 'at the limit' : 'within the limit'
  return `${c.name}: ${count} today. Limit ${l.limit} per ${l.period}, ${l.count} so far, ${status}.`
}

/** The counter pills in the header of every screen: `Cig 3` · `Weed 1`, or `Cig 3/5` once there is a limit. Tap = +1 with a 5-second Undo and optional reason chips; long-press or ▾ = past time and today's taps. */
export function CounterPills() {
  const { counters, loading } = useCounters()
  const list = activeCounters(counters)
  if (loading || list.length === 0) return null
  return <Pills list={list} />
}

function Pills({ list }: { list: Counter[] }) {
  const { counters, events, tap, removeEvent, setReason } = useCounters()
  const { goals } = useGoals()
  const inputs = useGoalInputs()
  const { writesDisabled } = useConnection()
  const toast = useToast()
  const today = useToday()
  const now = useNow(30_000)
  const [sheetFor, setSheetFor] = useState<string | null>(null)
  const hold = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({ timer: null, fired: false })

  const doTap = (c: Counter) => {
    const id = crypto.randomUUID()
    void tap(c.id, { id })
    const reasons = c.reasons ?? []
    const undo = () => void removeEvent(id)
    if (reasons.length === 0) { toast.show(`${counterLabel(c)} +1`, undo, { actionLabel: 'Undo', timeoutMs: 5000 }); return }
    // Optional: pick a reason or ignore the row. Picking one swaps the toast for a short confirmation that keeps Undo.
    const toastId = toast.show(`${counterLabel(c)} +1`, undo, {
      actionLabel: 'Undo', timeoutMs: REASON_TOAST_MS,
      extra: (
        <div role="group" aria-label={`Reason for ${c.name}, optional`} className="mt-2 flex flex-wrap gap-1.5">
          {reasons.map((r) => (
            <button key={r} type="button" className="min-h-9 rounded-full border border-current px-3 text-xs font-medium"
              onClick={() => { toast.dismiss(toastId); void setReason(id, r); toast.show(`${counterLabel(c)} +1 · ${r}`, undo, { actionLabel: 'Undo', timeoutMs: 5000 }) }}>{r}</button>
          ))}
        </div>
      ),
    })
  }
  const startHold = (c: Counter) => {
    hold.current.fired = false
    hold.current.timer = setTimeout(() => { hold.current.fired = true; setSheetFor(c.id) }, HOLD_MS)
  }
  const stopHold = () => { if (hold.current.timer) clearTimeout(hold.current.timer); hold.current.timer = null }

  return (
    <>
      <div role="group" aria-label="Counters" className="flex items-center gap-2 overflow-x-auto border-b border-slate-200 px-3 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] dark:border-slate-800 lg:px-8">
        {list.map((c) => {
          const count = totalBetween(forCounter(events, c.id), today, today)
          const limit = counterLimit(goals, c.id, inputs, today)
          const flagged = limit.state === 'at' || limit.state === 'over'
          return (
            <div key={c.id} data-limit={limit.state} className={`flex shrink-0 items-stretch overflow-hidden rounded-full border-2 ${flagged ? LIMIT_STYLE[limit.state as 'at' | 'over'] : 'bg-white dark:bg-slate-900'}`} style={flagged ? undefined : { borderColor: c.color }}>
              <button
                type="button"
                disabled={writesDisabled}
                aria-label={`${limitAria(c, count, limit)} Tap to add one, hold to add at another time`}
                onPointerDown={() => startHold(c)}
                onPointerUp={stopHold}
                onPointerLeave={stopHold}
                onPointerCancel={stopHold}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => { if (hold.current.fired) { hold.current.fired = false; return } doTap(c) }}
                className="flex min-h-10 touch-manipulation select-none items-center gap-1.5 pl-3 pr-2 text-sm font-medium active:bg-slate-100 disabled:opacity-50 dark:active:bg-slate-800"
                style={{ WebkitTouchCallout: 'none' }}
              >
                <span>{counterLabel(c)}</span>
                <span className="text-base font-bold tabular-nums">{limit.state === 'none' ? count : limitText(limit)}</span>
              </button>
              <button type="button" aria-label={`More for ${c.name}: add at another time, edit today's taps`} onClick={() => setSheetFor(c.id)}
                className="flex min-h-10 w-8 items-center justify-center border-l border-slate-200 text-xs text-slate-500 dark:border-slate-700"><span aria-hidden="true">▾</span></button>
            </div>
          )
        })}
      </div>
      <CounterSheet counter={counters.find((c) => c.id === sheetFor) ?? null} now={now} onClose={() => setSheetFor(null)} />
    </>
  )
}
