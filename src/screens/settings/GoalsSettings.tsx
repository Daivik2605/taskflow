import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Icon } from '../../app/Icon'
import { useConnection } from '../../app/connection'
import { useToday } from '../../app/useToday'
import { GoalBar } from '../../components/GoalBar'
import { TagPicker } from '../../components/TagPicker'
import { btn, btnDanger, btnPrimary, card, input, label, select, sectionTitle } from '../../components/ui'
import { useActivities } from '../../data/activities'
import { useAreas } from '../../data/areas'
import { useCounters } from '../../data/counters'
import { useGoalInputs } from '../../data/goalInputs'
import { useGoals } from '../../data/goals'
import { activeActivities } from '../../lib/activities'
import { activeCounters } from '../../lib/counters'
import {
  PERIOD_LABEL, METRICS, goalTitle, hoursToMinutes, liveGoals, periodResult, type Direction, type Goal, type GoalInput, type GoalPeriod, type Metric,
} from '../../lib/goals'
import { reorderGoals } from '../../lib/goalsOrder'

const isMetric = (v: string | undefined): v is Metric => METRICS.some((m) => m.value === v)
const hours = (minutes: number) => String(minutes / 60)

/** Add / edit form. Tag goals are typed in hours (stored as minutes). */
function GoalForm({ goal, preset, onDone }: { goal?: Goal; preset?: { metric: Metric; target_id: string | null }; onDone: () => void }) {
  const { add, edit } = useGoals()
  const { writesDisabled } = useConnection()
  const { counters } = useCounters()
  const { activities } = useActivities()
  const [metric, setMetric] = useState<Metric>(goal?.metric ?? preset?.metric ?? 'counter_count')
  const [target, setTarget] = useState<string | null>(goal?.target_id ?? preset?.target_id ?? null)
  const [direction, setDirection] = useState<Direction>(goal?.direction ?? (preset?.metric === 'counter_count' ? 'at_most' : 'at_least'))
  const [amount, setAmount] = useState(goal ? (goal.metric === 'tag_minutes' ? hours(goal.amount) : String(goal.amount)) : '')
  const [period, setPeriod] = useState<GoalPeriod>(goal?.period ?? (preset?.metric === 'tag_minutes' ? 'week' : preset?.metric === 'activity_count' ? 'week' : 'day'))
  const [name, setName] = useState(goal?.name ?? '')
  const [error, setError] = useState<string | null>(null)

  const pickMetric = (m: Metric) => {
    setMetric(m)
    setTarget(null)
    setDirection(m === 'counter_count' ? 'at_most' : 'at_least')
    if (m === 'tag_minutes' || m === 'activity_count') setPeriod('week')
  }

  const save = async () => {
    const n = Number(amount)
    const value = metric === 'tag_minutes' ? hoursToMinutes(n) : n
    if (amount.trim() === '' || Number.isNaN(n)) { setError('Enter an amount.'); return }
    const input: GoalInput = { name, metric, target_id: metric === 'tasks_done' ? null : target, direction, amount: value, period }
    const e = goal ? await edit(goal.id, input) : await add(input)
    setError(e)
    if (!e) onDone()
  }

  const targetLabel = METRICS.find((m) => m.value === metric)?.targetLabel
  return (
    <div className="space-y-3 p-3" role="group" aria-label={goal ? 'Edit goal' : 'New goal'}>
      <label className={label}>About
        <select className={`${select} mt-1`} value={metric} onChange={(e) => pickMetric(e.target.value as Metric)}>
          {METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </label>
      {metric === 'tag_minutes' && <div className={label}><span className="mb-1 block">{targetLabel} (a parent includes its sub-tags)</span><TagPicker value={target} onChange={setTarget} label="Goal tag" /></div>}
      {metric === 'counter_count' && (
        <label className={label}>{targetLabel}
          <select className={`${select} mt-1`} value={target ?? ''} onChange={(e) => setTarget(e.target.value || null)}>
            <option value="">Pick a counter</option>
            {activeCounters(counters).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      {metric === 'activity_count' && (
        <label className={label}>{targetLabel}
          <select className={`${select} mt-1`} value={target ?? ''} onChange={(e) => setTarget(e.target.value || null)}>
            <option value="">Pick an activity</option>
            {activeActivities(activities).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      )}
      <div className="grid grid-cols-3 gap-3">
        <label className={label}>Goal
          <select className={`${select} mt-1`} value={direction} onChange={(e) => setDirection(e.target.value as Direction)}>
            <option value="at_least">At least</option>
            <option value="at_most">At most</option>
          </select>
        </label>
        <label className={label}>{metric === 'tag_minutes' ? 'Hours' : metric === 'activity_count' ? 'Times' : 'Amount'}
          <input className={`${input} mt-1`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
        </label>
        <label className={label}>Per
          <select className={`${select} mt-1`} value={period} onChange={(e) => setPeriod(e.target.value as GoalPeriod)} aria-label="Period">
            {(['day', 'week', 'month'] as const).map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
          </select>
        </label>
      </div>
      <label className={label}>Name <span className="font-normal text-slate-500">(optional)</span>
        <input className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Uses the target's name" maxLength={60} />
      </label>
      {goal && <p className="text-xs text-slate-500">Changing the target keeps past {PERIOD_LABEL[goal.period]}s judged on the old one; the new target starts today.</p>}
      {metric === 'tag_minutes' && <p className="text-xs text-slate-500">Time goals fill from activity buttons now and from the timer once it exists.</p>}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary} disabled={writesDisabled} onClick={() => void save()}>{goal ? 'Save' : 'Add goal'}</button>
        <button className={btn} onClick={onDone}>Cancel</button>
      </div>
    </div>
  )
}

export function GoalsSettings() {
  const { goals, loading, setPaused, remove, reorder } = useGoals()
  const { writesDisabled } = useConnection()
  const { areas } = useAreas()
  const { counters } = useCounters()
  const { activities } = useActivities()
  const inputs = useGoalInputs()
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState<{ metric: Metric; target_id: string | null } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sectionRef = useRef<HTMLDivElement>(null)

  // "Set a goal" links arrive as /settings?goal=<metric>:<target id>.
  const presetParam = params.get('goal')
  useEffect(() => {
    if (!presetParam) return
    const [m, id] = presetParam.split(':')
    if (isMetric(m)) {
      setAdding({ metric: m, target_id: id || null })
      sectionRef.current?.scrollIntoView?.({ block: 'start' })
    }
    const next = new URLSearchParams(params)
    next.delete('goal')
    setParams(next, { replace: true })
  }, [presetParam]) // eslint-disable-line react-hooks/exhaustive-deps

  const lists = useMemo(() => ({ areas, counters, activities }), [areas, counters, activities])
  const live = liveGoals(goals)

  const row = (g: Goal, i: number) => {
    const r = periodResult(goals, g.series_id, g.period, today, inputs, today, { countPartial: true })
    return (
      <li key={g.series_id}>
        <div className="flex items-start gap-1 py-2 pl-3 pr-2">
          <div className="min-w-0 flex-1">
            {r && !g.paused
              ? <GoalBar title={goalTitle(g, lists)} metric={g.metric} direction={g.direction} result={r.result} />
              : <p className="min-h-11 py-2.5 text-sm font-medium">{goalTitle(g, lists)}{g.paused && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-normal text-slate-500 dark:bg-slate-800">paused</span>}</p>}
          </div>
          <button aria-label={`Move up: ${goalTitle(g, lists)}`} disabled={i === 0 || writesDisabled} onClick={() => void reorder(reorderGoals(live, g.series_id, 'up'))} className="flex h-11 w-9 items-center justify-center text-slate-500 disabled:opacity-25"><Icon name="up" className="h-5 w-5" /></button>
          <button aria-label={`Move down: ${goalTitle(g, lists)}`} disabled={i === live.length - 1 || writesDisabled} onClick={() => void reorder(reorderGoals(live, g.series_id, 'down'))} className="flex h-11 w-9 items-center justify-center text-slate-500 disabled:opacity-25"><Icon name="down" className="h-5 w-5" /></button>
        </div>
        {confirmDelete === g.series_id ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 border-t border-slate-100 p-3 text-sm dark:border-slate-800">
            <span className="flex-1">Delete “{goalTitle(g, lists)}” and its whole history (hit rate and streak)? This can’t be undone.</span>
            <button className={btnDanger} disabled={writesDisabled} onClick={async () => { await remove(g.series_id); setConfirmDelete(null) }}>Delete</button>
            <button className={btn} onClick={() => setConfirmDelete(null)}>Keep</button>
          </div>
        ) : editing === g.id ? (
          <div className="border-t border-slate-100 dark:border-slate-800"><GoalForm key={g.id} goal={g} onDone={() => setEditing(null)} /></div>
        ) : (
          <div className="flex flex-wrap gap-2 px-3 pb-3">
            <button className={btn} disabled={writesDisabled} onClick={() => setEditing(g.id)}>Edit {goalTitle(g, lists)}</button>
            <button className={btn} disabled={writesDisabled} onClick={async () => setError(await setPaused(g.id, !g.paused))}>{g.paused ? 'Resume' : 'Pause'}</button>
            <button className={btnDanger} disabled={writesDisabled} onClick={() => setConfirmDelete(g.series_id)} aria-label={`Delete ${goalTitle(g, lists)}`}>Delete</button>
          </div>
        )}
      </li>
    )
  }

  return (
    <div ref={sectionRef} id="goals">
      <h2 className={sectionTitle}>Goals</h2>
      <p className="mb-2 text-sm text-slate-500">Limits and targets. Changing a target keeps past days, weeks and months judged on the target they had then. Days off are skipped in daily goals.</p>
      {loading ? <p className="text-sm text-slate-500">Loading…</p> : live.length === 0 && !adding
        ? <p className={`${card} p-3 text-sm text-slate-500`}>No goals yet.</p>
        : live.length > 0 && <ul className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>{live.map(row)}</ul>}
      {error && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {adding
        ? <div className={`${card} mt-3`}><GoalForm preset={adding} onDone={() => setAdding(null)} /></div>
        : <button className={`${btnPrimary} mt-3`} disabled={writesDisabled} onClick={() => setAdding({ metric: 'counter_count', target_id: null })}>Add a goal</button>}
    </div>
  )
}
