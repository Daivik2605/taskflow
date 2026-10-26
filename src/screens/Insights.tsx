import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { TagLabel } from '../components/TagLabel'
import { btn, card, input } from '../components/ui'
import { useToday } from '../app/useToday'
import { useAreas } from '../data/areas'
import type { Area } from '../lib/areas'
import { useActivities } from '../data/activities'
import { useCounters } from '../data/counters'
import { useSettings } from '../data/settings'
import { useTasks } from '../data/tasks'
import { logDay, logMinutes } from '../lib/activities'
import { useTimeIntervals, useTimer } from '../data/timer'
import { estimateVsActual, minutesByDayByParent, minutesOnDay, sessionsOnDay, tagMinutes, tagRows as buildTagRows, taskMinutes, topTasks } from '../lib/timer'
import { effectiveKind } from '../lib/tags'
import { buildTree } from '../lib/tags'
import { activeCounters, byHourOfDay, counterLabel, counterStats, forCounter, perDay, perMonth, perWeek, reasonCounts, sumQty, type Bucket, type Counter, type CounterEvent } from '../lib/counters'
import { GoalBar } from '../components/GoalBar'
import { useGoalInputs } from '../data/goalInputs'
import { useGoals } from '../data/goals'
import { goalStats, goalTitle, liveGoals, periodLabel, PERIOD_LABEL, LOOKBACK } from '../lib/goals'
import { reachesToday, resolveRange, stepAnchor, daysIn, type RangeKind } from '../lib/insights'
import { completedOn, isDoneLate, taskChips, type Task } from '../lib/tasks'
import { addDays, dayOf, formatDay, formatDuration, formatTime, type Day } from '../lib/time'
import { useNow } from '../app/useNow'
import { counterSummary, tagSummary, taskSummary } from '../lib/summary'
import { WeekReview } from './WeekReview'

type Tab = 'day' | 'range' | 'counters' | 'goals' | 'review'
const TABS: { key: Tab; label: string }[] = [{ key: 'day', label: 'Day' }, { key: 'range', label: 'Range' }, { key: 'counters', label: 'Counters' }, { key: 'goals', label: 'Goals' }, { key: 'review', label: 'Review' }]
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
      {tab === 'goals' && <GoalsInsights />}
      {tab === 'review' && <WeekReview />}
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
  const { activities, logs } = useActivities()
  const { sessions } = useTimer()
  const intervals = useTimeIntervals()
  const now = useNow(30_000)
  const [day, setDay] = useState<Day>(today)

  const done = useMemo(() => completedOn(tasks, day), [tasks, day])
  const taps = useMemo(() => events.filter((e) => e.day === day).sort((a, b) => a.at.localeCompare(b.at)), [events, day])
  const totals = activeCounters(counters).map((c) => ({ c, n: sumQty(taps.filter((e) => e.counter_id === c.id)) })).filter((x) => x.n > 0)
  const dayLogs = useMemo(() => logs.filter((l) => logDay(l) === day), [logs, day])
  const daySessions = useMemo(() => sessionsOnDay(sessions, day, now), [sessions, day, now])
  const minutes = dayLogs.reduce((n, l) => n + logMinutes(l), 0) + daySessions.reduce((n, s) => n + minutesOnDay(s, day, now), 0)
  const dayTags = useMemo(() => buildTagRows(buildTree(areas), tagMinutes(intervals, day, day)), [areas, intervals, day])
  const timeline = [
    ...done.map((t) => ({ at: t.completed_at!, key: `t-${t.id}`, node: <TaskLine task={t} tag={areas.find((a) => a.id === t.area_id)} today={today} /> })),
    ...daySessions.map((s) => {
      const tag = areas.find((x) => x.id === s.area_id)
      const task = tasks.find((t) => t.id === s.task_id)
      const first = s.segments.find((g) => dayOf(g.started_at) === day)?.started_at ?? s.started_at
      return { at: first, key: `s-${s.id}`, node: <span>{task ? `${task.title} · ` : ''}{formatDuration(minutesOnDay(s, day, now))}{s.comment ? ` · ${s.comment}` : ''}{s.state !== 'stopped' ? ' · running' : ''}{tag && <> <span className="ml-2 text-xs text-slate-500"><TagLabel tag={tag} /></span></>}</span> }
    }),
    ...dayLogs.map((l) => { const a = activities.find((x) => x.id === l.preset_id); const tag = areas.find((x) => x.id === l.area_id); return { at: l.ended_at, key: `a-${l.id}`, node: <span>{a?.name ?? tag?.name ?? 'Activity'} · {logMinutes(l)} min{tag && <> <span className="ml-2 text-xs text-slate-500"><TagLabel tag={tag} /></span></>}</span> } }),
    ...taps.map((e) => { const c = counters.find((x) => x.id === e.counter_id); return { at: e.at, key: `e-${e.id}`, node: <span>{c?.name ?? 'Counter'}{e.qty > 1 ? ` ×${e.qty}` : ''}{e.note ? ` · ${e.note}` : ''}</span> } }),
  ].sort((a, b) => a.at.localeCompare(b.at))

  return (
    <div className="space-y-4">
      <Stepper label={day === today ? `Today · ${formatDay(day)}` : formatDay(day)} onPrev={() => setDay(stepAnchor('day', day, -1))} onNext={() => setDay(stepAnchor('day', day, 1))} nextDisabled={day >= today}>
        {day !== today && <button className={btn} onClick={() => setDay(today)}>Today</button>}
      </Stepper>
      <input className={input} type="date" aria-label="Go to day" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} />

      <p className="text-sm text-slate-600 dark:text-slate-400">
        {done.length} task{done.length === 1 ? '' : 's'} done{minutes > 0 ? ` · ${formatDuration(minutes)} of time` : ''}{totals.map(({ c, n }) => ` · ${counterLabel(c)} ${n}`).join('')}
      </p>

      {dayTags.length > 0 && <TagRowsList rows={dayTags} label="Day totals by tag" />}

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

function TagRowsList({ rows, label }: { rows: ReturnType<typeof buildTagRows>; label: string }) {
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label={label}>
      {rows.map((r) => (
        <li key={r.tag.id} className="px-3 py-2 text-sm">
          <div className="flex items-center justify-between"><span className="font-medium"><TagLabel tag={r.tag} /></span><b>{formatDuration(r.total)}</b></div>
          {r.general > 0 && r.kids.length > 0 && <div className="flex justify-between pl-4 text-xs text-slate-500"><span>general</span><span>{formatDuration(r.general)}</span></div>}
          {r.kids.map((k) => <div key={k.tag.id} className="flex justify-between pl-4 text-xs text-slate-500"><span><TagLabel tag={k.tag} /></span><span>{formatDuration(k.minutes)}</span></div>)}
        </li>
      ))}
    </ul>
  )
}

function RangeView() {
  const today = useToday()
  const { weekStartsOn } = useSettings()
  const { tasks } = useTasks()
  const { areas } = useAreas()
  const { counters, events } = useCounters()
  const intervals = useTimeIntervals()
  const [params] = useSearchParams()
  const fromLink = params.get('range')
  const [kind, setKind] = useState<RangeKind>(fromLink === 'day' || fromLink === 'week' || fromLink === 'month' ? fromLink : 'week') // ?range= from the Today overview cards
  const [anchor, setAnchor] = useState<Day>(today)
  const [custom, setCustom] = useState<{ from: Day; to: Day }>({ from: today, to: today })

  const range = resolveRange(kind, anchor, weekStartsOn, custom)
  // The same summary functions the evening shutdown and the weekly review use (lib/summary.ts), so the three screens can't disagree.
  const stats = useMemo(() => taskSummary(tasks, range.from, range.to, today), [tasks, range.from, range.to, today])
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

  // Time = activity-button logs plus timer segments.
  const tagRows = useMemo(() => tagSummary({ areas, sessions: intervals }, range.from, range.to).rows, [areas, intervals, range.from, range.to])
  const studyRows = useMemo(() => tagRows.filter((r) => effectiveKind(areas, r.tag.parent_id, r.tag.kind) === 'study'), [tagRows, areas])
  const perDayTags = useMemo(() => minutesByDayByParent(intervals, areas, range.from, range.to), [intervals, areas, range.from, range.to])
  const chart = useMemo(() => {
    const parents = tagRows.map((r) => r.tag)
    const rows: Record<string, number | string>[] = []
    for (let d = range.from; d <= range.to && rows.length < 400; d = addDays(d, 1)) {
      const m = perDayTags.get(d)
      rows.push({ day: d.slice(5), ...Object.fromEntries(parents.map((p) => [p.id, Math.round(((m?.get(p.id) ?? 0) / 60) * 100) / 100])) })
    }
    return { parents, rows }
  }, [tagRows, perDayTags, range.from, range.to])
  const top = useMemo(() => topTasks(intervals, range.from, range.to, 5), [intervals, range.from, range.to])
  const est = useMemo(() => estimateVsActual(tasks, taskMinutes(intervals), new Set(topTasks(intervals, range.from, range.to, 9999).map((t) => t.task_id))), [tasks, intervals, range.from, range.to])

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
        <h2 className="px-3 pt-3 text-sm font-semibold text-slate-500">Time by tag</h2>
        {tagRows.length === 0 ? <p className="px-3 py-2 text-sm text-slate-500">No time logged in this range.</p> : <TagRowsList rows={tagRows} label="Time by tag" />}
      </div>

      {chart.parents.length > 0 && (
        <div className={`${card} p-3`}>
          <h3 className="mb-2 text-sm font-semibold text-slate-500">Hours per day</h3>
          <div style={{ width: '100%', height: 220 }} role="img" aria-label="Hours per day, stacked by tag">
            <ResponsiveContainer>
              <BarChart data={chart.rows}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" fontSize={11} />
                <YAxis fontSize={11} width={28} />
                <Tooltip />
                <Legend />
                {chart.parents.map((p) => <Bar key={p.id} dataKey={p.id} name={p.name} stackId="h" fill={p.color} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className={card}>
        <h2 className="px-3 pt-3 text-sm font-semibold text-slate-500">Studying, per sub-tag</h2>
        {studyRows.length === 0 ? <p className="px-3 py-2 text-sm text-slate-500">No study time in this range.</p> : <TagRowsList rows={studyRows} label="Studying per sub-tag" />}
      </div>

      <div className={card}>
        <h2 className="px-3 pt-3 text-sm font-semibold text-slate-500">Top tasks by time</h2>
        {top.length === 0 ? <p className="px-3 py-2 text-sm text-slate-500">No time on tasks in this range.</p> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label="Top tasks by time">
            {top.map((t) => <li key={t.task_id} className="flex justify-between px-3 py-2 text-sm"><span>{tasks.find((x) => x.id === t.task_id)?.title ?? 'Deleted task'}</span><b>{formatDuration(t.minutes)}</b></li>)}
          </ul>
        )}
      </div>

      <div className={card}>
        <h2 className="px-3 pt-3 text-sm font-semibold text-slate-500">Estimate vs actual</h2>
        {est.length === 0 ? <p className="px-3 py-2 text-sm text-slate-500">No task with an estimate and time in this range.</p> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label="Estimate vs actual">
            {est.map((r) => (
              <li key={r.task.id} className="flex justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{r.task.title}</span>
                <span className={r.over ? 'font-semibold text-amber-600 dark:text-amber-400' : ''}>{formatDuration(r.actual)} of {formatDuration(r.estimate)}{r.over ? ` · over by ${formatDuration(r.actual - r.estimate)}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={card}>
        <h2 className="px-3 pt-3 text-sm font-semibold text-slate-500">Counters</h2>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {counterSummary(counters, events, range.from, range.to).map(({ counter: c, total }) => {
            return <li key={c.id} className="flex items-center justify-between px-3 py-2 text-sm"><span>{c.name}</span><span><b>{total}</b> <span className="text-xs text-slate-500">· {(total / daysIn(range)).toFixed(1)}/day</span></span></li>
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
            className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-medium ${c.id === current.id ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'border-slate-300 dark:border-slate-700'}`}>{c.name}</button>
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

      <Reasons key={current.id} counter={current} events={mine} today={today} />

      <BarsChart title="Per day · last 30 days" data={perDay(mine, today, 30)} color={current.color} />
      <BarsChart title="Per week · last 12 weeks" data={perWeek(mine, today, 12, weekStartsOn)} color={current.color} />
      <BarsChart title="Per month · last 12 months" data={perMonth(mine, today, 12)} color={current.color} />
    </div>
  )
}


// ───────────── Reasons ─────────────
type Scope = '30' | 'all'

/** Why the taps happened (only taps where a reason was picked say why), and when in the day. Pick a reason to see its hours. */
function Reasons({ counter, events, today }: { counter: Counter; events: CounterEvent[]; today: Day }) {
  const [scope, setScope] = useState<Scope>('30')
  const [reason, setReason] = useState<string | null>(null)
  const inScope = useMemo(() => (scope === 'all' ? events : events.filter((e) => e.day >= addDays(today, -29) && e.day <= today)), [events, scope, today])
  const { reasons, none } = useMemo(() => reasonCounts(inScope), [inScope])
  const hours: Bucket[] = useMemo(() => byHourOfDay(inScope, reason ?? undefined).map((total, h) => ({ key: String(h), label: `${h}`, from: today, to: today, total })), [inScope, reason, today])
  const max = Math.max(1, ...reasons.map((r) => r.count))
  const tagged = reasons.reduce((n, r) => n + r.count, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-500">Reasons</h3>
        <div role="radiogroup" aria-label="Reasons period" className="flex gap-1">
          {([['30', 'Last 30 days'], ['all', 'All time']] as const).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={scope === k} onClick={() => setScope(k)}
              className={`min-h-9 rounded-full border px-3 text-xs font-medium ${scope === k ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'border-slate-300 dark:border-slate-700'}`}>{l}</button>
          ))}
        </div>
      </div>
      {tagged === 0 ? (
        <p className={`${card} p-3 text-sm text-slate-500`}>No reasons picked yet. After a tap, a row of reason chips shows up for a few seconds; picking one is optional.</p>
      ) : (
        <ul className={`${card} space-y-2 p-3`} aria-label="Taps by reason">
          {reasons.map((r) => (
            <li key={r.reason}>
              <button type="button" aria-pressed={reason === r.reason} onClick={() => setReason(reason === r.reason ? null : r.reason)} className="block w-full text-left">
                <div className="flex justify-between text-sm"><span className={reason === r.reason ? 'font-semibold' : ''}>{r.reason}</span><span className="tabular-nums text-slate-500">{r.count}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true"><div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: counter.color }} /></div>
              </button>
            </li>
          ))}
          {none > 0 && <li className="text-xs text-slate-500">{none} with no reason picked</li>}
        </ul>
      )}
      <BarsChart title={`By hour of day${reason ? ` · ${reason}` : ''} · ${scope === 'all' ? 'all time' : 'last 30 days'}`} data={hours} color={counter.color} />
      {reason && <button type="button" className={btn} onClick={() => setReason(null)}>Show all taps</button>}
    </div>
  )
}

// ───────────── Goals ─────────────
function GoalsInsights() {
  const today = useToday()
  const { goals, loading } = useGoals()
  const { areas } = useAreas()
  const { counters } = useCounters()
  const { activities } = useActivities()
  const inputs = useGoalInputs()
  const lists = { areas, counters, activities }
  const live = useMemo(() => liveGoals(goals), [goals])
  const stats = useMemo(() => live.map((g) => ({ g, s: goalStats(goals, g.series_id, inputs, today) })), [live, goals, inputs, today])

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>
  if (live.length === 0) return <p className={`${card} p-3 text-sm text-slate-500`}>No goals yet. Set them in Settings → Goals.</p>
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Hit rate and streak count finished days, weeks or months, each judged on the target it had then. Days off and paused stretches are skipped.</p>
      {stats.map(({ g, s }) => (
        <section key={g.series_id} className={`${card} space-y-3 p-3`} aria-label={goalTitle(g, lists)}>
          {s.current && !g.paused
            ? <GoalBar title={goalTitle(g, lists)} metric={g.metric} direction={g.direction} result={s.current.result} />
            : <h3 className="text-sm font-medium">{goalTitle(g, lists)}{g.paused ? ' (paused)' : ''}</h3>}
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div><dt className="text-xs text-slate-500">Hit rate</dt><dd className="text-xl font-bold" aria-label={`Hit rate: ${s.hitRate === null ? 'none yet' : `${Math.round(s.hitRate * 100)} percent`}`}>{s.hitRate === null ? '—' : `${Math.round(s.hitRate * 100)}%`}</dd><dd className="text-xs text-slate-500">{s.hits} of {s.total}</dd></div>
            <div><dt className="text-xs text-slate-500">Streak</dt><dd className="text-xl font-bold">{s.streak}</dd><dd className="text-xs text-slate-500">{PERIOD_LABEL[g.period]}{s.streak === 1 ? '' : 's'} in a row</dd></div>
            <div><dt className="text-xs text-slate-500">Best streak</dt><dd className="text-xl font-bold">{s.best}</dd><dd className="text-xs text-slate-500">last {LOOKBACK[g.period]} {PERIOD_LABEL[g.period]}s</dd></div>
          </dl>
          {s.history.length > 0 && (
            <ul className="flex flex-wrap gap-1" aria-label="Recent periods, newest first">
              {s.history.slice(0, 30).map((r) => (
                <li key={r.window.from} title={`${periodLabel(g.period, r.window)}: ${r.result.value} vs ${r.version.amount}`}
                  className={`flex h-6 min-w-6 items-center justify-center rounded text-[10px] font-bold ${r.result.status === 'hit' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                  <span className="sr-only">{periodLabel(g.period, r.window)}: </span>{r.result.status === 'hit' ? 'Y' : 'N'}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
