import { useRef, useState } from 'react'
import { useConnection } from '../app/connection'
import { useNow } from '../app/useNow'
import { useToast } from '../app/toast'
import { useToday } from '../app/useToday'
import { useCounters } from '../data/counters'
import { activeCounters, lastEvent, sinceLabel, totalBetween, forCounter, type Counter } from '../lib/counters'
import { CounterSheet } from './CounterSheet'

const HOLD_MS = 500

/** The big counter buttons on Today: tap = +1 now (with a 5-second Undo), long-press or "…" = past time / edit today's taps. */
export function CounterButtons() {
  const { counters, events, tap, removeEvent, loading } = useCounters()
  const { writesDisabled } = useConnection()
  const toast = useToast()
  const today = useToday()
  const now = useNow(30_000)
  const [sheetFor, setSheetFor] = useState<string | null>(null)
  const hold = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({ timer: null, fired: false })

  const list = activeCounters(counters)
  if (loading || list.length === 0) return null

  const doTap = (c: Counter) => {
    const id = crypto.randomUUID()
    void tap(c.id, { id })
    toast.show(`${c.emoji ?? ''} ${c.name} +1`.trim(), () => void removeEvent(id), { actionLabel: 'Undo', timeoutMs: 5000 })
  }

  const startHold = (c: Counter) => {
    hold.current.fired = false
    hold.current.timer = setTimeout(() => { hold.current.fired = true; setSheetFor(c.id) }, HOLD_MS)
  }
  const stopHold = () => { if (hold.current.timer) clearTimeout(hold.current.timer); hold.current.timer = null }

  return (
    <>
      <div className="grid grid-cols-2 gap-3" role="group" aria-label="Counters">
        {list.map((c) => {
          const mine = forCounter(events, c.id)
          const count = totalBetween(mine, today, today)
          const last = lastEvent(events, c.id)
          return (
            <div key={c.id} className="relative">
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
                className="flex min-h-28 w-full touch-manipulation select-none flex-col items-center justify-center gap-0.5 rounded-2xl border-2 bg-white px-2 py-3 text-center active:scale-[0.98] disabled:opacity-50 dark:bg-slate-900"
                style={{ borderColor: c.color, WebkitTouchCallout: 'none' }}
              >
                <span className="text-3xl" aria-hidden="true">{c.emoji}</span>
                <span className="text-sm font-medium">{c.name}</span>
                <span className="text-3xl font-bold leading-none">{count}</span>
                <span className="text-xs text-slate-500">{last ? `last: ${sinceLabel(last.at, now)}` : 'none yet'}</span>
              </button>
              <button type="button" aria-label={`More for ${c.name}: add at another time, edit today's taps`} onClick={() => setSheetFor(c.id)}
                className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full text-lg text-slate-500">…</button>
            </div>
          )
        })}
      </div>
      <CounterSheet counter={counters.find((c) => c.id === sheetFor) ?? null} onClose={() => setSheetFor(null)} />
    </>
  )
}
