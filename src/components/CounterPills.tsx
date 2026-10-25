import { useRef, useState } from 'react'
import { useConnection } from '../app/connection'
import { useNow } from '../app/useNow'
import { useToast } from '../app/toast'
import { useToday } from '../app/useToday'
import { useCounters } from '../data/counters'
import { activeCounters, counterLabel, forCounter, totalBetween, type Counter } from '../lib/counters'
import { CounterSheet } from './CounterSheet'

const HOLD_MS = 500

/** The counter pills in the header of every screen: `Cig 3` · `Weed 1`. Tap = +1 with a 5-second Undo; long-press or ▾ = past time and today's taps. */
export function CounterPills() {
  const { counters, loading } = useCounters()
  const list = activeCounters(counters)
  if (loading || list.length === 0) return null
  return <Pills list={list} />
}

function Pills({ list }: { list: Counter[] }) {
  const { counters, events, tap, removeEvent } = useCounters()
  const { writesDisabled } = useConnection()
  const toast = useToast()
  const today = useToday()
  const now = useNow(30_000)
  const [sheetFor, setSheetFor] = useState<string | null>(null)
  const hold = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({ timer: null, fired: false })

  const doTap = (c: Counter) => {
    const id = crypto.randomUUID()
    void tap(c.id, { id })
    toast.show(`${counterLabel(c)} +1`, () => void removeEvent(id), { actionLabel: 'Undo', timeoutMs: 5000 })
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
          return (
            <div key={c.id} className="flex shrink-0 items-stretch overflow-hidden rounded-full border-2 bg-white dark:bg-slate-900" style={{ borderColor: c.color }}>
              <button
                type="button"
                disabled={writesDisabled}
                aria-label={`${c.name}: ${count} today. Tap to add one, hold to add at another time`}
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
                <span className="text-base font-bold tabular-nums">{count}</span>
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
