import { useMemo, useState } from 'react'
import { useToday } from '../app/useToday'
import { useDays } from '../data/days'
import { useTasks } from '../data/tasks'
import { planCandidates, planCardVisible, toggleTop3, TOP3_MAX } from '../lib/dayPlan'
import { taskChips } from '../lib/tasks'
import { QuickAdd } from './QuickAdd'
import { btn, btnPrimary, card } from './ui'

/** Morning plan (SPEC §18): pick the Top 3 from today's tasks and deadlines, add anything missing, note your energy. Shows until saved or dismissed. */
export function PlanCard() {
  const today = useToday()
  const { get, save } = useDays()
  const { tasks } = useTasks()
  const row = get(today)
  const [picked, setPicked] = useState<string[]>(row?.top3 ?? [])
  const [energy, setEnergy] = useState<number | null>(row?.plan_energy ?? null)
  const [busy, setBusy] = useState(false)
  const candidates = useMemo(() => planCandidates(tasks, today), [tasks, today])
  if (!planCardVisible(row)) return null

  const finish = async (patch: Parameters<typeof save>[1]) => { setBusy(true); await save(today, patch); setBusy(false) }

  return (
    <section aria-label="Plan the day" className={`${card} space-y-3 p-3`}>
      <div>
        <h2 className="font-semibold">Plan the day</h2>
        <p className="text-sm text-slate-500">Pick up to {TOP3_MAX} things that make today a good day.</p>
      </div>
      {candidates.length === 0 ? <p className="text-sm text-slate-500">Nothing is planned yet. Add a task below.</p> : (
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800" aria-label="Today's tasks and deadlines">
          {candidates.map((t) => {
            const on = picked.includes(t.id)
            return (
              <li key={t.id} className="flex items-center gap-2 py-1">
                <button type="button" aria-pressed={on} aria-label={`${on ? 'Remove from' : 'Add to'} Top 3: ${t.title}`} disabled={!on && picked.length >= TOP3_MAX}
                  onClick={() => setPicked((p) => toggleTop3(p, t.id))}
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-sm font-bold disabled:opacity-40 ${on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-700'}`}>
                  {on ? picked.indexOf(t.id) + 1 : ''}
                </button>
                <span className="min-w-0 flex-1 text-sm"><span className="block truncate">{t.title}</span>
                  <span className="text-xs text-slate-500">{taskChips(t, today).map((c) => c.text).join(' · ')}</span></span>
              </li>
            )
          })}
        </ul>
      )}
      <QuickAdd defaultDue={today} />
      <div role="radiogroup" aria-label="Energy this morning" className="flex items-center gap-2">
        <span className="text-sm text-slate-500">Energy</span>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={energy === n} onClick={() => setEnergy(energy === n ? null : n)}
            className={`h-11 w-11 rounded-lg border text-sm font-medium ${energy === n ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'border-slate-300 dark:border-slate-700'}`}>{n}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={busy} onClick={() => void finish({ top3: picked, plan_energy: energy, planned_at: new Date().toISOString() })}>Save plan</button>
        <button className={btn} disabled={busy} onClick={() => void finish({ plan_dismissed_at: new Date().toISOString() })}>Not today</button>
      </div>
    </section>
  )
}
