import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useConnection } from '../app/connection'
import { useToday } from '../app/useToday'
import { useCounters } from '../data/counters'
import { bestGapThisWeek, lastEvent, longestGap, forCounter, sinceLabel, todaysEvents, type Counter, type CounterEvent } from '../lib/counters'
import { formatDuration, formatTime, instantToTorontoLocal, torontoLocalToInstant } from '../lib/time'
import { useSettings } from '../data/settings'
import { btn, btnDanger, btnPrimary, input, label, select } from './ui'

/** Long-press / "…" on a counter: add a tap at a past time, and edit or delete today's taps. Times are read as Toronto time. */
export function CounterSheet({ counter, now, onClose }: { counter: Counter | null; now: Date; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (counter && !d.open) d.showModal()
    if (!counter && d.open) d.close()
  }, [counter])

  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }} aria-label={counter ? `${counter.name} taps` : 'Counter'}
      className="m-0 mt-auto max-h-[92vh] w-full max-w-none overflow-y-auto rounded-t-2xl bg-white p-0 text-slate-900 backdrop:bg-black/40 dark:bg-slate-900 dark:text-slate-100 lg:m-auto lg:max-w-md lg:rounded-2xl">
      {counter && <SheetBody key={counter.id} counter={counter} now={now} onClose={onClose} />}
    </dialog>
  )
}

function SheetBody({ counter, now, onClose }: { counter: Counter; now: Date; onClose: () => void }) {
  const { events, tap, removeEvent } = useCounters()
  const { writesDisabled } = useConnection()
  const today = useToday()
  const { weekStartsOn } = useSettings()
  const [reason, setReason] = useState('')
  const [when, setWhen] = useState(() => instantToTorontoLocal(new Date()))
  const [qty, setQty] = useState('1')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  const taps = todaysEvents(events, counter.id, today)
  const last = lastEvent(events, counter.id)
  const mine = forCounter(events, counter.id)
  const longestToday = longestGap(mine, today, now)
  const bestWeek = bestGapThisWeek(mine, today, now, weekStartsOn)
  const reasons = counter.reasons ?? []

  const check = (whenValue: string, qtyValue: string): { at: Date; qty: number } | null => {
    let at: Date
    try { at = torontoLocalToInstant(whenValue) } catch { setError('Pick a date and time.'); return null }
    const q = Number(qtyValue)
    if (!Number.isInteger(q) || q < 1) { setError('Quantity must be 1 or more.'); return null }
    if (at.getTime() > Date.now() + 60_000) { setError('That time is in the future.'); return null }
    setError(null)
    return { at, qty: q }
  }

  const add = async (e: FormEvent) => {
    e.preventDefault()
    const v = check(when, qty)
    if (!v) return
    const ev = await tap(counter.id, { at: v.at, qty: v.qty, note: note.trim() || null, reason: reason || null })
    if (ev) { setNote(''); setReason(''); setQty('1'); setWhen(instantToTorontoLocal(new Date())) }
  }

  return (
    <div className="space-y-5 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: counter.color }} aria-hidden="true" />{counter.name}</h2>
          <p className="text-sm text-slate-500">{last ? `last: ${sinceLabel(last.at, now)}` : 'none yet'}</p>
          <p className="text-sm text-slate-500">
            Longest gap today: {longestToday === null ? 'none yet' : formatDuration(longestToday)} · Best gap this week: {bestWeek === null ? 'none yet' : formatDuration(bestWeek)}
          </p>
        </div>
        <button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-lg text-xl" aria-label="Close">✕</button>
      </div>

      <form onSubmit={add} noValidate className="space-y-3" aria-label="Add a past tap">
        <h3 className="text-sm font-semibold text-slate-500">Add a tap at another time</h3>
        <label className={label}>When (Toronto time)
          <input className={`${input} mt-1`} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>How many
            <input className={`${input} mt-1`} type="number" min={1} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          <label className={label}>Note <span className="font-normal text-slate-500">(optional)</span>
            <input className={`${input} mt-1`} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        {reasons.length > 0 && (
          <label className={label}>Reason <span className="font-normal text-slate-500">(optional)</span>
            <select className={`${select} mt-1`} value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">No reason</option>
              {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        )}
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button className={`${btnPrimary} w-full`} disabled={writesDisabled}>Add</button>
      </form>

      <div>
        <h3 className="mb-1 text-sm font-semibold text-slate-500">Today's taps · {taps.reduce((n, t) => n + t.qty, 0)}</h3>
        {taps.length === 0 ? <p className="text-sm text-slate-500">None yet today.</p> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {taps.map((t) => editing === t.id
              ? <EditRow key={t.id} ev={t} reasons={reasons} check={check} onDone={() => setEditing(null)} />
              : (
                <li key={t.id} className="flex items-center gap-2 py-1">
                  <span className="flex-1 text-sm">{formatTime(t.at)}{t.qty > 1 ? ` · ×${t.qty}` : ''}{t.reason ? ` · ${t.reason}` : ''}{t.note ? ` · ${t.note}` : ''}</span>
                  <button type="button" className={`${btn} min-h-9 px-3`} disabled={writesDisabled} onClick={() => setEditing(t.id)} aria-label={`Edit tap at ${formatTime(t.at)}`}>Edit</button>
                  <button type="button" className={`${btnDanger} min-h-9 px-3`} disabled={writesDisabled} onClick={() => void removeEvent(t.id)} aria-label={`Delete tap at ${formatTime(t.at)}`}>Delete</button>
                </li>
              ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1 text-sm text-indigo-600 dark:text-indigo-400">
          <Link to={`/insights?tab=counters&counter=${counter.id}`} onClick={onClose}>See stats →</Link>
          <Link to={`/settings?goal=counter_count:${counter.id}`} onClick={onClose}>Set a goal →</Link>
        </div>
        <button type="button" className={btn} onClick={onClose}>Done</button>
      </div>
    </div>
  )

}

function EditRow({ ev, reasons, check, onDone }: { ev: CounterEvent; reasons: string[]; check: (when: string, qty: string) => { at: Date; qty: number } | null; onDone: () => void }) {
  const { editEvent } = useCounters()
  const [when, setWhen] = useState(instantToTorontoLocal(ev.at))
  const [qty, setQty] = useState(String(ev.qty))
  const [note, setNote] = useState(ev.note ?? '')
  const [reason, setReason] = useState(ev.reason ?? '')
  const options = ev.reason && !reasons.includes(ev.reason) ? [...reasons, ev.reason] : reasons
  const save = async () => {
    const v = check(when, qty)
    if (!v) return
    if (await editEvent(ev.id, { at: v.at, qty: v.qty, note: note.trim() || null, reason: reason || null })) onDone()
  }
  return (
    <li className="space-y-2 py-2">
      <input className={input} type="datetime-local" aria-label="Time" value={when} onChange={(e) => setWhen(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <input className={input} type="number" min={1} aria-label="Quantity" value={qty} onChange={(e) => setQty(e.target.value)} />
        <input className={input} aria-label="Note" placeholder="Note" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      {options.length > 0 && (
        <select className={select} aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">No reason</option>
          {options.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      )}
      <div className="flex gap-2">
        <button type="button" className={btnPrimary} onClick={() => void save()}>Save</button>
        <button type="button" className={btn} onClick={onDone}>Cancel</button>
      </div>
    </li>
  )
}
