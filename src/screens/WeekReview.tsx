import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { GoalBar } from '../components/GoalBar'
import { btn, btnPrimary, card, input } from '../components/ui'
import { useToday } from '../app/useToday'
import { useActivities } from '../data/activities'
import { useAreas } from '../data/areas'
import { useCounters } from '../data/counters'
import { useDays } from '../data/days'
import { useGoalInputs } from '../data/goalInputs'
import { useGoals } from '../data/goals'
import { useSettings } from '../data/settings'
import { useWeeks } from '../data/weeks'
import { counterLabel } from '../lib/counters'
import { goalTitle, hoursToMinutes, liveGoals, type Goal } from '../lib/goals'
import { buildWeekReview, reviewWeekFor, weekPair, type Averages, type SleepRow } from '../lib/weekReview'
import { addDays, diffDays, formatDay, formatDuration, type Day } from '../lib/time'

// Sleep rows arrive with the Calendar (phase 8); until then the sleep average shows a dash.
const NO_SLEEP: SleepRow[] = []
const card2 = `${card} p-3`
const h2 = 'mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500'
const avg = (n: number | null, digits = 1) => (n === null ? '—' : n.toFixed(digits))
const delta = (n: number) => (n === 0 ? '=' : `${n > 0 ? '▲' : '▼'} ${formatDuration(Math.abs(n))}`)

function AmountEditor({ goal, onSave }: { goal: Goal; onSave: (amount: number) => Promise<string | null> }) {
  const minutes = goal.metric === 'tag_minutes'
  const [text, setText] = useState(String(minutes ? goal.amount / 60 : goal.amount))
  const [msg, setMsg] = useState<string | null>(null)
  const n = Number(text)
  return (
    <div className="flex items-center gap-2">
      <input className={`${input} w-24`} inputMode="decimal" aria-label={`New amount${minutes ? ' (hours)' : ''}`} value={text} onChange={(e) => { setText(e.target.value); setMsg(null) }} />
      <span className="text-sm text-slate-500">{minutes ? 'h' : ''}</span>
      <button className={btn} disabled={!Number.isFinite(n) || n <= 0} onClick={async () => { const amount = minutes ? hoursToMinutes(n) : Math.round(n); setMsg(await onSave(amount) ?? 'Saved, from today.') }}>Set</button>
      {msg && <span role="status" className="text-xs text-slate-500">{msg}</span>}
    </div>
  )
}

function AvgLine({ label, now, before, digits }: { label: string; now: number | null; before: number | null; digits?: number }) {
  return <div className="flex justify-between text-sm"><span>{label}</span><span><b>{avg(now, digits)}</b> <span className="text-xs text-slate-500">before {avg(before, digits)}</span></span></div>
}

const sleepHours = (a: Averages) => (a.sleepMinutes === null ? null : a.sleepMinutes / 60)

/** Insights → Review (SPEC §18): last week against the week before, then next week's goals and a note. */
export function WeekReview() {
  const today = useToday()
  const { weekStartsOn } = useSettings()
  const inputs = useGoalInputs()
  const { goals, edit } = useGoals()
  const { counters } = useCounters()
  const { activities } = useActivities()
  const { areas } = useAreas()
  const { days } = useDays()
  const { weeks, get, save } = useWeeks()
  const sleep = NO_SLEEP
  const [span, setSpan] = useState(() => reviewWeekFor(today, weekStartsOn))
  const [note, setNote] = useState<string | null>(null)

  const review = useMemo(() => buildWeekReview({ ...inputs, goals, counters, activities }, days, sleep, span, today, weekStartsOn), [inputs, goals, counters, activities, days, sleep, span, today, weekStartsOn])
  const row = get(span.from)
  const text = note ?? row?.note ?? ''
  const live = liveGoals(goals).filter((g) => !g.paused)
  const lists = { areas, counters, activities }
  const step = (dir: 1 | -1) => setSpan(weekPair(addDays(span.from, 7 * dir), weekStartsOn).week)
  const past = weeks.filter((w) => w.reviewed_at).sort((a, b) => b.week_start.localeCompare(a.week_start))
  const t = review.week.tasks
  const tb = review.before.tasks

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button className={btn} aria-label="Previous week" onClick={() => step(-1)}>‹</button>
        <div className="text-center"><div className="font-medium">{formatDay(span.from)} – {formatDay(span.to)}</div>
          <div className="text-xs text-slate-500">{row?.reviewed_at ? 'Reviewed' : 'Not reviewed yet'} · against {formatDay(weekPair(span.from, weekStartsOn).before.from)} – {formatDay(weekPair(span.from, weekStartsOn).before.to)}</div></div>
        <button className={btn} aria-label="Next week" disabled={span.to >= today} onClick={() => step(1)}>›</button>
      </div>

      <section className={card2} aria-label="Hours by tag">
        <h2 className={h2}>Hours by tag</h2>
        {review.tagCompare.length === 0 ? <p className="text-sm text-slate-500">No time logged in either week.</p> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {review.tagCompare.map((c) => (
              <li key={c.tag.id} className="flex items-center justify-between py-1.5 text-sm">
                <span>{c.tag.name}</span>
                <span><b>{formatDuration(c.now)}</b> <span className="text-xs text-slate-500">before {formatDuration(c.before)} · {delta(c.delta)}</span></span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-500">Total {formatDuration(review.week.totalMinutes)} · before {formatDuration(review.before.totalMinutes)}</p>
      </section>

      <section className={card2} aria-label="Planned versus actual">
        <h2 className={h2}>Planned vs actual · {review.goalsHit} of {review.goalsJudged} goals met</h2>
        {review.week.goals.length === 0 ? <p className="text-sm text-slate-500">No goal was judged this week. Set goals in Settings → Goals.</p> : (
          <div className="space-y-3">
            {review.week.goals.map((line) => {
              const r = line.results[line.results.length - 1]!
              return line.results.length === 1
                ? <GoalBar key={line.series_id} title={goalTitle(line.goal, lists)} metric={line.goal.metric} direction={line.goal.direction} result={r.result} finished />
                : <p key={line.series_id} className="text-sm">{goalTitle(line.goal, lists)}: met on <b>{line.passing}</b> of {line.judged} days</p>
            })}
          </div>
        )}
      </section>

      <section className={card2} aria-label="Tasks">
        <h2 className={h2}>Tasks</h2>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[['Done', t.done.length, tb.done.length], ['Missed', t.missed.length, tb.missed.length], ['Deadlines missed', t.deadlinesMissed.length, tb.deadlinesMissed.length]].map(([label, n, b]) => (
            <div key={label as string}><dt className="text-xs text-slate-500">{label}</dt><dd className="text-2xl font-bold" aria-label={`${label}: ${n}`}>{n}</dd><dd className="text-xs text-slate-500">before {b}</dd></div>
          ))}
        </dl>
      </section>

      <section className={card2} aria-label="Activities">
        <h2 className={h2}>Activities vs targets</h2>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {review.week.activities.map((a, i) => (
            <li key={a.activity.id} className="flex justify-between py-1.5 text-sm"><span>{a.activity.name}</span>
              <span><b>{a.count}</b>{a.target ? ` / ${a.target}` : ''} <span className="text-xs text-slate-500">before {review.before.activities[i]?.count ?? 0}</span></span></li>
          ))}
          {review.week.activities.length === 0 && <li className="py-1.5 text-sm text-slate-500">No activities yet.</li>}
        </ul>
      </section>

      <section className={card2} aria-label="Counters">
        <h2 className={h2}>Counters</h2>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {review.week.counters.map(({ counter, total }, i) => {
            const b = review.before.counters[i]?.total ?? 0
            return <li key={counter.id} className="flex justify-between py-1.5 text-sm"><span>{counterLabel(counter)}</span>
              <span><b>{total}</b> <span className="text-xs text-slate-500">{(total / review.week.days).toFixed(1)}/day · before {b}</span></span></li>
          })}
        </ul>
      </section>

      <section className={card2} aria-label="Averages">
        <h2 className={h2}>Averages</h2>
        <AvgLine label="Mood" now={review.averages.mood} before={review.averagesBefore.mood} />
        <AvgLine label="Energy" now={review.averages.energy} before={review.averagesBefore.energy} />
        <AvgLine label="Sleep (h)" now={sleepHours(review.averages)} before={sleepHours(review.averagesBefore)} />
      </section>

      <section className={card2} aria-label="Deadlines ahead">
        <h2 className={h2}>Deadlines in the next 14 days</h2>
        {review.deadlines.length === 0 ? <p className="text-sm text-slate-500">None open.</p> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {review.deadlines.map((d) => <li key={d.id} className="flex justify-between py-1.5 text-sm"><span>{d.title}</span><span className="text-xs text-slate-500">{formatDay(d.due_on as Day)} · in {diffDays(today, d.due_on as Day)} d</span></li>)}
          </ul>
        )}
      </section>

      <section className={card2} aria-label="Next week's goals">
        <h2 className={h2}>Next week's goals</h2>
        <p className="mb-2 text-xs text-slate-500">A new amount applies from today; past weeks keep the target they had. Add or pause goals in <Link to="/settings" className="text-indigo-600 dark:text-indigo-400">Settings → Goals</Link>.</p>
        <ul className="space-y-3">
          {live.map((g) => (
            <li key={g.id} className="space-y-1"><div className="text-sm font-medium">{goalTitle(g, lists)}</div>
              <AmountEditor goal={g} onSave={(amount) => edit(g.id, { name: g.name, metric: g.metric, target_id: g.target_id, direction: g.direction, amount, period: g.period })} /></li>
          ))}
          {live.length === 0 && <li className="text-sm text-slate-500">No goals yet.</li>}
        </ul>
      </section>

      <section className={card2} aria-label="Review note">
        <h2 className={h2}>Note</h2>
        <textarea className={`${input} min-h-24 py-2`} aria-label="Review note" value={text} onChange={(e) => setNote(e.target.value)} placeholder="What worked, what didn't, what changes next week" />
        <div className="mt-2 flex gap-2">
          <button className={btnPrimary} onClick={async () => { if (await save(span.from, { note: text.trim() || null, reviewed_at: new Date().toISOString() })) setNote(null) }}>{row?.reviewed_at ? 'Update review' : 'Finish review'}</button>
        </div>
      </section>

      <section className={card2} aria-label="Past reviews">
        <h2 className={h2}>Past reviews</h2>
        {past.length === 0 ? <p className="text-sm text-slate-500">None yet.</p> : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {past.map((w) => (
              <li key={w.week_start}>
                <button className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm" onClick={() => setSpan(weekPair(w.week_start, weekStartsOn).week)}>
                  <span>{formatDay(w.week_start)} – {formatDay(addDays(w.week_start, 6))}</span><span className="min-w-0 truncate text-xs text-slate-500">{w.note ?? ''}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
