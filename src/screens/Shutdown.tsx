import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GoalBar } from '../components/GoalBar'
import { TagLabel } from '../components/TagLabel'
import { btn, btnPrimary, card, input } from '../components/ui'
import { useToast } from '../app/toast'
import { useToday } from '../app/useToday'
import { useActivities } from '../data/activities'
import { useAreas } from '../data/areas'
import { useCounters } from '../data/counters'
import { useDays } from '../data/days'
import { useGoalInputs } from '../data/goalInputs'
import { useGoals } from '../data/goals'
import { useTasks } from '../data/tasks'
import { activeActivities, doneToday } from '../lib/activities'
import { counterLabel } from '../lib/counters'
import { rollToTomorrow, shutdownTasks, triage, type Triage } from '../lib/dayPlan'
import { currentProgress, goalTitle } from '../lib/goals'
import { periodSummary } from '../lib/summary'
import { taskChips, type Task } from '../lib/tasks'
import { formatDay, formatDuration } from '../lib/time'

const Scale = ({ label, value, onChange }: { label: string; value: number | null; onChange: (n: number | null) => void }) => (
  <div role="radiogroup" aria-label={label} className="flex items-center gap-2">
    <span className="w-14 text-sm text-slate-500">{label}</span>
    {[1, 2, 3, 4, 5].map((n) => (
      <button key={n} type="button" role="radio" aria-checked={value === n} onClick={() => onChange(value === n ? null : n)}
        className={`h-11 w-11 rounded-lg border text-sm font-medium ${value === n ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'border-slate-300 dark:border-slate-700'}`}>{n}</button>
    ))}
  </div>
)

/** Evening shutdown (SPEC §18): what got done, every open task → tomorrow / a day / no date / drop, missed activities, mood, energy, note. */
export function Shutdown() {
  const today = useToday()
  const navigate = useNavigate()
  const toast = useToast()
  const { tasks, update } = useTasks()
  const { areas } = useAreas()
  const { counters } = useCounters()
  const { activities, logs, log } = useActivities()
  const { goals } = useGoals()
  const { get, save } = useDays()
  const inputs = useGoalInputs()
  const row = get(today)

  const [handled, setHandled] = useState<Record<string, string>>({})
  const [picking, setPicking] = useState<string | null>(null)
  const [pickDay, setPickDay] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [mood, setMood] = useState<number | null>(row?.mood ?? null)
  const [energy, setEnergy] = useState<number | null>(row?.energy ?? null)
  const [note, setNote] = useState(row?.review_note ?? '')
  const [busy, setBusy] = useState(false)

  const summary = useMemo(() => periodSummary({ ...inputs, goals, counters, activities }, today, today, today), [inputs, goals, counters, activities, today])
  const open = useMemo(() => shutdownTasks(tasks, row, today), [tasks, row, today])
  const left = open.filter((t) => !(t.id in handled))
  const progress = useMemo(() => currentProgress(goals, inputs, today), [goals, inputs, today])
  const lists = { areas, counters, activities }
  const missedActivities = activeActivities(activities).filter((a) => !doneToday(logs, a.id, today))

  const apply = async (t: Task, action: Triage, label: string) => {
    const r = triage(t, action, today)
    if (r.error) { setProblem(r.error); return }
    setProblem(null)
    if (r.patch) await update(t.id, r.patch)
    setHandled((h) => ({ ...h, [t.id]: r.note ?? label }))
    setPicking(null)
  }

  const rollAll = async () => {
    const { changes, keptDeadlines } = rollToTomorrow(left, today)
    for (const c of changes) await update(c.id, c.patch)
    setHandled((h) => ({ ...h, ...Object.fromEntries(left.map((t) => [t.id, t.hard_deadline ? 'deadline stays' : 'tomorrow'])) }))
    toast.show(`${changes.length} moved to tomorrow${keptDeadlines ? `, ${keptDeadlines} deadline${keptDeadlines === 1 ? '' : 's'} kept their date` : ''}`)
  }

  const finish = async () => {
    setBusy(true)
    const ok = await save(today, { mood, energy, review_note: note.trim() || null, reviewed_at: new Date().toISOString() })
    setBusy(false)
    if (ok) navigate('/')
  }

  return (
    <section className="mx-auto max-w-2xl space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Shut down the day</h1>
        <p className="text-sm text-slate-500">{formatDay(today)} · <Link to="/" className="text-indigo-600 dark:text-indigo-400">Back to Today</Link></p>
      </header>

      <div className={`${card} space-y-3 p-3`} aria-label="Today in numbers" role="group">
        <p className="text-sm">
          <b>{summary.tasks.done.length}</b> task{summary.tasks.done.length === 1 ? '' : 's'} done · <b>{formatDuration(summary.totalMinutes)}</b> of time
          {summary.counters.map(({ counter, total }) => <span key={counter.id}> · {counterLabel(counter)} <b>{total}</b></span>)}
        </p>
        {summary.tags.length > 0 && (
          <ul className="text-sm" aria-label="Time by tag">
            {summary.tags.map((r) => <li key={r.tag.id} className="flex justify-between"><TagLabel tag={r.tag} /><b>{formatDuration(r.total)}</b></li>)}
          </ul>
        )}
        {progress.length > 0 && (
          <div className="space-y-2" aria-label="Goals">
            {progress.map(({ goal, result, dayOff }) => dayOff ? null : (
              <GoalBar key={goal.id} title={goalTitle(goal, lists)} metric={goal.metric} direction={goal.direction} result={result} finished={goal.period === 'day'} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Still open · {left.length}</h2>
          {left.length > 0 && <button className={btnPrimary} onClick={() => void rollAll()}>Roll all to tomorrow</button>}
        </div>
        {problem && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{problem}</p>}
        {open.length === 0 && <p className="text-sm text-slate-500">Nothing is left open for today.</p>}
        <ul className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>
          {open.map((t) => (
            <li key={t.id} className="space-y-2 px-3 py-2">
              <div className="text-sm"><span className={t.id in handled ? 'text-slate-500 line-through' : ''}>{t.title}</span>
                <span className="ml-2 text-xs text-slate-500">{t.id in handled ? `→ ${handled[t.id]}` : taskChips(t, today).map((c) => c.text).join(' · ')}</span></div>
              {!(t.id in handled) && (
                <div className="flex flex-wrap gap-2">
                  <button className={`${btn} min-h-9 px-3`} onClick={() => void apply(t, { kind: 'tomorrow' }, 'tomorrow')}>Tomorrow</button>
                  <button className={`${btn} min-h-9 px-3`} onClick={() => { setPicking(picking === t.id ? null : t.id); setPickDay('') }}>Pick a day</button>
                  <button className={`${btn} min-h-9 px-3`} onClick={() => void apply(t, { kind: 'none' }, 'no date')}>No date</button>
                  <button className={`${btn} min-h-9 px-3`} onClick={() => void apply(t, { kind: 'drop' }, 'dropped')}>Drop</button>
                </div>
              )}
              {picking === t.id && !(t.id in handled) && (
                <div className="flex gap-2">
                  <input className={input} type="date" aria-label={`Day for ${t.title}`} value={pickDay} min={today} onChange={(e) => setPickDay(e.target.value)} />
                  <button className={btnPrimary} disabled={!pickDay} onClick={() => void apply(t, { kind: 'day', day: pickDay }, formatDay(pickDay))}>Move</button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500">Drop keeps the task: restore it from Tasks → Dropped. A deadline keeps its due date.</p>
      </div>

      {missedActivities.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Not logged today</h2>
          <p className="text-xs text-slate-500">Tap any you did.</p>
          <div className="flex flex-wrap gap-2">
            {missedActivities.map((a) => <button key={a.id} className={btn} onClick={() => void log(a.id)}>{a.name}</button>)}
          </div>
        </div>
      )}

      <div className={`${card} space-y-3 p-3`}>
        <Scale label="Mood" value={mood} onChange={setMood} />
        <Scale label="Energy" value={energy} onChange={setEnergy} />
        <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="One line about today (optional)" aria-label="Note about today" maxLength={300} />
        <button className={btnPrimary} disabled={busy} onClick={() => void finish()}>Finish</button>
      </div>
    </section>
  )
}
