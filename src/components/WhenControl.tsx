import { WINDOW_PRESETS, windowPreset, type WhenKind, type WhenValue, type WindowPreset } from '../lib/tasks'
import { addDays, type Day } from '../lib/time'
import { input, label } from './ui'

const KINDS: { kind: WhenKind; label: string }[] = [
  { kind: 'none', label: 'No date' }, { kind: 'day', label: 'On a day' }, { kind: 'window', label: 'Window' }, { kind: 'deadline', label: 'Deadline' },
]

interface Props { value: WhenValue; onChange: (v: WhenValue) => void; today: Day; weekStart: number }

const seg = (on: boolean) =>
  `min-h-11 rounded-lg border px-2 text-sm font-medium ${on ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'border-slate-300 dark:border-slate-700'}`

/** "When" — one control for the four kinds of date (SPEC §3). Switching kind carries a sensible date across and clears what no longer applies. */
export function WhenControl({ value, onChange, today, weekStart }: Props) {
  const anyDay = (): Day | '' => (value.kind === 'day' ? value.day : value.kind === 'window' ? value.end : value.kind === 'deadline' ? value.due : '')

  const switchTo = (kind: WhenKind) => {
    if (kind === value.kind) return
    if (kind === 'none') onChange({ kind })
    else if (kind === 'day') onChange({ kind, day: anyDay() || today })
    else if (kind === 'window') onChange({ kind, start: today, end: anyDay() && anyDay() >= today ? (anyDay() as Day) : addDays(today, 6) })
    else onChange({ kind, due: anyDay() as Day, startFrom: null })
  }

  const presetActive = (p: WindowPreset) => {
    if (value.kind !== 'window') return false
    const r = windowPreset(p, today, weekStart)
    return value.start === r.start && value.end === r.end
  }
  const custom = value.kind === 'window' && !WINDOW_PRESETS.some((p) => presetActive(p.key))

  return (
    <fieldset className="space-y-3">
      <legend className={label}>When</legend>
      <div role="radiogroup" aria-label="When" className="mt-1 grid grid-cols-4 gap-2">
        {KINDS.map((k) => (
          <button key={k.kind} type="button" role="radio" aria-checked={value.kind === k.kind} onClick={() => switchTo(k.kind)} className={seg(value.kind === k.kind)}>{k.label}</button>
        ))}
      </div>

      {value.kind === 'day' && (
        <label className={label}>Day
          <input className={`${input} mt-1`} type="date" value={value.day} onChange={(e) => onChange({ kind: 'day', day: e.target.value })} />
        </label>
      )}

      {value.kind === 'window' && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Window length">
            {WINDOW_PRESETS.map((p) => (
              <button key={p.key} type="button" aria-pressed={presetActive(p.key)} onClick={() => { const r = windowPreset(p.key, today, weekStart); onChange({ kind: 'window', start: r.start, end: r.end }) }} className={seg(presetActive(p.key))}>{p.label}</button>
            ))}
            <span aria-pressed={custom} className={`${seg(custom)} flex items-center`}>Custom range</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>From
              <input className={`${input} mt-1`} type="date" value={value.start ?? ''} onChange={(e) => onChange({ kind: 'window', start: e.target.value || null, end: value.end })} />
            </label>
            <label className={label}>Until
              <input className={`${input} mt-1`} type="date" value={value.end} onChange={(e) => onChange({ kind: 'window', start: value.start, end: e.target.value })} />
            </label>
          </div>
        </div>
      )}

      {value.kind === 'deadline' && (
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>Deadline
            <input className={`${input} mt-1`} type="date" value={value.due} onChange={(e) => onChange({ kind: 'deadline', due: e.target.value, startFrom: value.startFrom })} />
          </label>
          <label className={label}>Start working from <span className="font-normal text-slate-500">(optional)</span>
            <input className={`${input} mt-1`} type="date" value={value.startFrom ?? ''} onChange={(e) => onChange({ kind: 'deadline', due: value.due, startFrom: e.target.value || null })} />
          </label>
        </div>
      )}
    </fieldset>
  )
}
