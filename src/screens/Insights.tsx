import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { TagLabel } from '../components/TagLabel'
import { btn, card, input } from '../components/ui'
import { useToday } from '../app/useToday'
import { useAreas } from '../data/areas'
import type { Area } from '../lib/areas'
import { useCounters } from '../data/counters'
import { useSettings } from '../data/settings'
import { useTasks } from '../data/tasks'
import { activeCounters, counterStats, forCounter, perDay, perMonth, perWeek, sumQty, totalBetween, type Bucket, type Counter } from '../lib/counters'
import { reachesToday, resolveRange, stepAnchor, daysIn, type RangeKind } from '../lib/insights'
import { completedOn, isDoneLate, rangeStats, taskChips, type Task } from '../lib/tasks'
import { formatDay, formatTime, type Day } from '../lib/time'

type Tab = 'day' | 'range' | 'counters'
const TABS: { key: Tab; label: string }[] = [{ key: 'day', label: 'Day' }, { key: 'range', label: 'Range' }, { key: 'counters', label: 'Counters' }]
const isTab = (v: string | null): v is Tab => TABS.some((t) => t.key === v)

export default function Insights() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = isTab(params.get('tab')) ? (params.get('tab') as Tab) : 'day'
  const setTab = (t: Tab) => { const n = new URLSearchParams(params); if (t === 'day') n.delete('tab'); else n.set('tab', t); setParams(n, { replace: true }) }

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Insights</h1>
      <div role="tablist" aria-label="Insights" className="flex gap-1">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`min-h-11 flex-1 rounded-full px-4 text-sm font-medium ${tab === t.key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'day' && <DayLog />}
      {tab === 'range' && <RangeView />}
      {tab === 'counters' && <CounterStats />}
    </section>
  )
}

function Stepper({ label, onPrev, onNext, nextDisabled, children }: { label: string; onPrev: () => void; onNext: () => void; nextDisabled: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <button className={`${btn} w-12 px-0`} onClick={onPrev} aria-label="Previous">‹</button>
      <div className="min-w-0 flex-1 text-center font-medium" aria-live="polite">{label}</div>
      <button className={`${btn} w-12 px-0`} onClick={onNext} disabled={nextDisabled} aria-label="Next">›</button>
      {children}
    </div>
  )
}

// ───────────── Day ─────────────
function TaskLine({ task, tag, today }: { task: Task; tag: Area | undefined; today: Day }) {
  return (
    <span>
      <span className="mr-1" aria-hidden="true">✓</span>{task.title}
      {isDoneLate(task) && <> <span className="ml-2 text-xs font-semibold text-amber-600 dark:text-amber-400">{taskChips(task, today)[0]?.text}</span></>}
      {tag && <> <span className="ml-2 text-xs text-slate-500"><TagLabel tag={tag} /></span></>}
    </span>
  )
}

function DayLog() {
  const today = useToday()
  const { tasks } = useTasks()
  const { areas } = useAreas()
  const { counters, events } = useCounters()
  const [day, setDay] = useState<Day>(today)

  const done = useMemo(() => completedOn(tasks, day), [tasks, day])
  const taps = useMemo(() => events.filter((e) => e.day === day).sort((a, b) => a.at.localeCompare(b.at)), [events, day])
  const totals = activeCounters(counters).map((c) => ({ c, n: sumQty(taps.filter((e) => e.counter_id === c.id)) })).filter((x) => x.n > 0)
  const timeline = [
    ...done.map((t) => ({ at: t.completed_at!, key: `t-${t.id}`, node: <TaskLine task={t} tag={areas.find((a) => a.id === t.area_id)} today={today} /> })),
    ...taps.map((e) => { const c = counters.find((x) => x.id === e.counter_id); return { at: e.at, key: `e-${e.id}`, node: <span>{c?.emoji} {c?.name ?? 'Counter'}{e.qty > 1 ? ` ×${e.qty}` : ''}{e.note ? ` · ${e.note}` : ''}</span> } }),
  ].sort((a, b) => a.at.localeCompare(b.at))

  return (
    <div className="space-y-4">
      <Stepper label={day === today ? `Today · ${formatDay(day)}` : formatDay(day)} onPrev={() => setDay(stepAnchor('day', day, -1))} onNext={() => setDay(stepAnchor('day', day, 1))} nextDisabled={day >= today}>
        {day !== today && <button className={btn} onClick={() => setDay(today)}>Today</button>}
      </Stepper>
      <input className={input} type="date" aria-label="Go to day" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} />

      <p className="text-sm text-slate-600 dark:text-slate-400">
        {done.length} task{done.length === 1 ? '' : 's'} done{totals.map(({ c, n }) => ` · ${c.emoji ?? ''} ${n}`).join('')}
      </p>

      {timeline.length === 0 ? <p className="text-sm text-slate-500">Nothing logged for this day.</p> : (
        <ol className={`${card} divide-y divide-slate-100 dark:divide-slate-800`} aria-label="Log">
          {timeline.map((it) => (
            <li key={it.key} className="flex gap-3 px-3 py-2 text-sm">
              <time className="w-16 shrink-0 text-slate-500" dateTime={it.at}>{formatTime(it.at)}</time>
              {it.node}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ───────────── Range ─────────────
const RANGE_KINDS: { key: RangeKind; label: string }[] = [{ key: 'day', label: 'Day' }, { key: 'week', label: 'Week' }, { key: 'month', label: 'Month' }, { key: 'custom', label: 'Custom' }]

function RangeView() {
  const today = useToday()
  const { weekStartsOn } = useSettings()
  const { tasks } = useTasks()
  const { areas } = useAreas()
  const { counters, events } = useCounters()
  const [params] = useSearchParams()
  const fromLink = params.get('range')
  const [kind, setKind] = useState<RangeKind>(fromLink === 'day' || fromLink === 'week' || fromLink === 'month' ? fromLink : 'week') // ?range= from the Today overview cards
  const [anchor, setAnchor] = useState<Day>(today)
  const [custom, setCustom] = useState<{ from: Day; to: Day }>({ from: today, to: today })

  const range = resolveRange(kind, anchor, weekStartsOn, custom)
  const stats = useMemo(() => rangeStats(tasks, range.from, range.to, today), [tasks, range.from, range.to, today])
  const list = (ts: Task[], empty: string) => ts.length === 0 ? <p className="px-3 py-2 text-sm text-slate-500">{empty}</p> : (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {ts.map((t) => {
        const tag = areas.find((a) => a.id === t.area_id)
        return (
          <li key={t.id} className="px-3 py-2 text-sm">
            <span>{t.title}</span>
            <span className="ml-2 text-xs text-slate-500">{t.due_on ? `due ${formatDay(t.due_on)}` : ''}{t.status === 'done' && isDoneLate(t) ? ' · done late' : ''}</span>
            {tag && <span className="ml-2 text-xs text-slate-500"><TagLabel tag={tag} /></span>}
          </li>
        )
      })}
    </ul>
  )

  const cards = [
    { label: 'Tasks done', n: stats.done.length, tone: 'text-emerald-600 dark:text-emerald-400' },
    { label: 'Tasks missed', n: stats.missed.length, tone: 'text-red-600 dark:text-red-400' },
    { label: 'Deadlines missed', n: stats.deadlinesMissed.length, tone: 'text-red-600 dark:text-red-400' },
  ]

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Range" className="grid grid-cols-4 gap-2">
        {RANGE_KINDS.map((k) => (
          <button key={k.key} role="radio" aria-checked={kind === k.key} onClick={() => setKind(k.key)}
            className={`min-h-11 rounded-lg border text-sm font-medium ${kind === k.key ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'border-slate-300 dark:border-slate-700'}`}>{k.label}</button>
        ))}
      </div>

      {kind === 'custom' ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">From<input className={`${input} mt-1`} type="date" value={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} /></label>
          <label className="text-sm font-medium">To<input className={`${input} mt-1`} type="date" value={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} /></label>
        </div>
      ) : (
        <Stepper label={range.label} onPrev={() => setAnchor(stepAnchor(kind, anchor, -1))} onNext={() => setAnchor(stepAnchor(kind, anchor, 1))} nextDisabled={reachesToday(range, today)} />
      )}
      <p className="text-center text-xs text-slate-500">{range.label} · {daysIn(range)} day{daysIn(range) === 1 ? '' : 's'}</p>

      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Task totals">
        {cards.map((c) => (
          <div key={c.label} className={`${card} p-3 text-center`}>
            <div className={`text-3xl font-bold ${c.tone}`} aria-label={`${c.label}: ${c.n}`}>{c.n}</div>
            <div className="text-xs text-slate-500">{c.label}</div>
          </div>
        ))}
      </div>

      <details open className={card}><summary className="min-h-11 cursor-pointer px-3 py-2 font-medium">Tasks done · {stats.done.length}</summary>{list(stats.done, 'None finished in this range.')}</details>
      <details open className={card}><summary className="min-h-11 cursor-pointer px-3 py-2 font-medium">Tasks missed · {stats.missed.length}</summary>{list(stats.missed, 'None missed.')}</details>
      <details open className={card}><summary className="min-h-11 cursor-pointer px-3 py-2 font-medium">Deadlines missed · {stats.deadlinesMissed.length}</summary>{list(stats.deadlinesMissed, 'No deadlines missed.')}</details>

      <div className={card}>
        <h2 className="px-3 pt-3 text-sm font-semibold text-slate-500">Counters</h2>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {activeCounters(counters).map((c) => {
            const total = totalBetween(forCounter(events, c.id), range.from, range.to)
            return <li key={c.id} className="flex items-center justify-between px-3 py-2 text-sm"><span>{c.emoji} {c.name}</span><span><b>{total}</b> <span className="text-xs text-slate-500">· {(total / daysIn(range)).toFixed(1)}/day</span></span></li>
          })}
          {counters.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No counters yet.</li>}
        </ul>
      </div>
    </div>
  )
}

// ───────────── Counters ─────────────
function BarsChart({ title, data, color }: { title: string; data: Bucket[]; color: string }) {
  const rows = data.map((b) => ({ label: b.label, total: b.total }))
  return (
    <div className={`${card} p-3`}>
      <h3 className="mb-2 text-sm font-semibold text-slate-500">{title}</h3>
      <div role="img" aria-label={`${title}: ${data.map((b) => `${b.label} ${b.total}`).join(', ')}`} className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b833" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip cursor={{ fill: '#94a3b822' }} />
            <Bar dataKey="total" fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function CounterStats() {
  const today = useToday()
  const { weekStartsOn } = useSettings()
  const { counters, events } = useCounters()
  const [params, setParams] = useSearchParams()
  const list = activeCounters(counters)
  const current: Counter | undefined = list.find((c) => c.id === params.get('counter')) ?? list[0]

  const mine = useMemo(() => (current ? forCounter(events, current.id) : []), [events, current])
  const stats = useMemo(() => counterStats(mine, today, weekStartsOn), [mine, today, weekStartsOn])

  if (!current) return <p className="text-sm text-slate-500">No counters yet. Add one in Settings → Counters.</p>

  const cells: [string, string][] = [
    ['Today', String(stats.today)], ['This week', String(stats.week)], ['This month', String(stats.month)], ['All time', String(stats.allTime)],
    ['7-day average', `${stats.avg7.toFixed(1)}/day`], ['30-day average', `${stats.avg30.toFixed(1)}/day`],
    ['Days since last', stats.daysSinceLast === null ? '—' : String(stats.daysSinceLast)], ['Zero days this month', String(stats.zeroDaysThisMonth)],
  ]

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Counter" className="flex gap-2 overflow-x-auto">
        {list.map((c) => (
          <button key={c.id} role="tab" aria-selected={c.id === current.id} onClick={() => { const n = new URLSearchParams(params); n.set('counter', c.id); setParams(n, { replace: true }) }}
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium ${c.id === current.id ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'border-slate-300 dark:border-slate-700'}`}>{c.emoji} {c.name}</button>
        ))}
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={`${current.name} stats`}>
        {cells.map(([k, v]) => (
          <div key={k} className={`${card} p-3`}>
            <dt className="text-xs text-slate-500">{k}</dt>
            <dd className="text-xl font-bold" aria-label={`${k}: ${v}`}>{v}</dd>
          </div>
        ))}
      </dl>

      <BarsChart title="Per day · last 30 days" data={perDay(mine, today, 30)} color={current.color} />
      <BarsChart title="Per week · last 12 weeks" data={perWeek(mine, today, 12, weekStartsOn)} color={current.color} />
      <BarsChart title="Per month · last 12 months" data={perMonth(mine, today, 12)} color={current.color} />
    </div>
  )
}

