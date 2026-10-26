import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useNow } from '../app/useNow'
import { useToday } from '../app/useToday'
import { ActivityButtons } from '../components/ActivityButtons'
import { SessionEditor } from '../components/SessionEditor'
import { TagLabel } from '../components/TagLabel'
import { TagPicker } from '../components/TagPicker'
import { TaskSelect } from '../components/TaskSelect'
import { btn, btnDanger, btnPrimary, card, input, label, sectionTitle } from '../components/ui'
import { useAreas } from '../data/areas'
import { useSettings } from '../data/settings'
import { useTasks } from '../data/tasks'
import { useTimeIntervals, useTimer } from '../data/timer'
import { buildTree, tagPath } from '../lib/tags'
import { clock, elapsedMs, minutesByDayOf, sessionsOnDay, tagMinutes, tagRows } from '../lib/timer'
import { addDays, formatDuration, formatTime, instantToTorontoLocal, parseDuration, torontoLocalToInstant, weekBounds } from '../lib/time'

/** SPEC §4: start, pause, resume and stop; add a past session; today's sessions; totals per tag. */
export function Timer() {
  const { active, loading } = useTimer()
  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Timer</h1>
      {loading ? <p role="status" className="text-sm text-slate-500">Loading…</p> : active ? <Running /> : <StartForm />}
      <div>
        <h2 className={sectionTitle}>Quick log</h2>
        <ActivityButtons />
        <p className="mt-2 text-xs text-slate-500">One tap logs the default minutes, ending now. Edit them in <Link to="/settings" className="text-indigo-600 dark:text-indigo-400">Settings → Activities</Link>.</p>
      </div>
      <AddPast />
      <TodaySessions />
      <Totals />
    </section>
  )
}

function StartForm() {
  const { requestStart } = useTimer()
  const { areas } = useAreas()
  const { tasks } = useTasks()
  const [params] = useSearchParams()
  const fromLink = params.get('task')
  const linked = fromLink ? tasks.find((t) => t.id === fromLink) ?? null : null
  const [tag, setTag] = useState<string | null>(null)
  const [task, setTask] = useState<string | null>(fromLink)
  const [comment, setComment] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Arriving from a task's play button: use that task's tag when it has one.
  useEffect(() => { if (linked?.area_id) setTag((t) => t ?? linked.area_id) }, [linked?.id, linked?.area_id]) // eslint-disable-line react-hooks/exhaustive-deps

  const pickTask = (id: string | null) => {
    setTask(id)
    const t = tasks.find((x) => x.id === id)
    if (t?.area_id && areas.some((a) => a.id === t.area_id)) setTag(t.area_id)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!tag) { setError('Pick a tag first: the time has to count somewhere.'); return }
    setError(null)
    if (await requestStart({ areaId: tag, taskId: task, comment })) setComment('')
  }

  return (
    <form onSubmit={submit} className={`${card} space-y-3 p-4`} aria-label="Start a timer" noValidate>
      <div className={label}><span className="mb-1 block">Tag</span><TagPicker value={tag} onChange={setTag} label="Timer tag" /></div>
      <div className={label}><span className="mb-1 block">Task <span className="font-normal text-slate-500">(optional)</span></span><TaskSelect value={task} onChange={pickTask} label="Timer task" /></div>
      <label className={label}>Comment <span className="font-normal text-slate-500">(optional)</span><input className={`${input} mt-1`} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button className={`${btnPrimary} w-full`}>Start</button>
    </form>
  )
}

function Running() {
  const { active, pause, resume, stop, setComment } = useTimer()
  const { areas } = useAreas()
  const { tasks } = useTasks()
  const now = useNow(1000)
  const [comment, setText] = useState(active?.comment ?? '')
  const id = active?.id
  const stored = active?.comment ?? ''
  // A comment typed on another device shows up here unless this field has unsaved typing.
  useEffect(() => { setText(stored) }, [id, stored])
  if (!active) return null
  const task = tasks.find((t) => t.id === active.task_id)
  const paused = active.state === 'paused'
  const save = () => { if (comment.trim() !== stored.trim()) void setComment(active.id, comment) }

  return (
    <div role="region" className={`${card} space-y-3 p-4`} aria-label="Running timer">
      <div>
        <p className="text-sm text-slate-500">{paused ? 'Paused' : 'Running'} · {tagPath(areas, active.area_id)}</p>
        {task && <p className="font-medium">{task.title}</p>}
      </div>
      <p className={`text-5xl font-bold tabular-nums ${paused ? 'text-slate-400' : ''}`} role="timer" aria-label={`Elapsed ${clock(elapsedMs(active, now))}`}>{clock(elapsedMs(active, now))}</p>
      <label className={label}>Comment<input className={`${input} mt-1`} value={comment} onChange={(e) => setText(e.target.value)} onBlur={save} /></label>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={btn} onClick={() => void (paused ? resume() : pause())}>{paused ? 'Resume' : 'Pause'}</button>
        <button type="button" className={btnPrimary} onClick={() => void stop({ comment })}>Stop</button>
      </div>
    </div>
  )
}

function AddPast() {
  const { addPast } = useTimer()
  const [open, setOpen] = useState(false)
  const [tag, setTag] = useState<string | null>(null)
  const [task, setTask] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [start, setStart] = useState(() => instantToTorontoLocal(new Date(Date.now() - 3600_000)))
  const [duration, setDuration] = useState('')
  const [end, setEnd] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!tag) { setError('Pick a tag.'); return }
    let s: Date, en: Date
    try { s = torontoLocalToInstant(start) } catch { setError('Pick a start.'); return }
    if (duration.trim()) {
      const m = parseDuration(duration)
      if (!m || m < 1) { setError('Duration must be at least a minute, e.g. 40 or 1h30.'); return }
      en = new Date(s.getTime() + m * 60_000)
    } else {
      try { en = torontoLocalToInstant(end) } catch { setError('Give a duration or an end.'); return }
    }
    setError(null)
    if (await addPast({ areaId: tag, taskId: task, comment, start: s, end: en })) { setComment(''); setDuration(''); setEnd(''); setOpen(false) }
  }

  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className={card}>
      <summary className="min-h-11 cursor-pointer px-4 py-3 font-medium">Add a past session</summary>
      <form onSubmit={submit} className="space-y-3 p-4 pt-0" aria-label="Add a past session" noValidate>
        <div className={label}><span className="mb-1 block">Tag</span><TagPicker value={tag} onChange={setTag} label="Past session tag" /></div>
        <div className={label}><span className="mb-1 block">Task <span className="font-normal text-slate-500">(optional)</span></span><TaskSelect value={task} onChange={setTask} label="Past session task" /></div>
        <label className={label}>Started (Toronto time)<input className={`${input} mt-1`} type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className={label}>Duration<input className={`${input} mt-1`} inputMode="text" placeholder="40 or 1h30" value={duration} onChange={(e) => setDuration(e.target.value)} /></label>
          <label className={label}>or ended at<input className={`${input} mt-1`} type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        <label className={label}>Comment<input className={`${input} mt-1`} placeholder="Called Mom" value={comment} onChange={(e) => setComment(e.target.value)} /></label>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button className={`${btnPrimary} w-full`}>Add session</button>
      </form>
    </details>
  )
}

function TodaySessions() {
  const today = useToday()
  const now = useNow(30_000)
  const { sessions, remove } = useTimer()
  const { areas } = useAreas()
  const { tasks } = useTasks()
  const [editing, setEditing] = useState<string | null>(null)
  const list = useMemo(() => sessionsOnDay(sessions, today, now).filter((s) => s.state === 'stopped'), [sessions, today, now])

  return (
    <div>
      <h2 className={sectionTitle}>Today's sessions · {list.length}</h2>
      {list.length === 0 ? <p className="text-sm text-slate-500">Nothing finished today yet.</p> : (
        <ul className={`${card} divide-y divide-slate-100 dark:divide-slate-800`} aria-label="Today's sessions">
          {list.map((s) => {
            const tag = areas.find((a) => a.id === s.area_id)
            const task = tasks.find((t) => t.id === s.task_id)
            const total = [...minutesByDayOf(s, now).values()].reduce((n, m) => n + m, 0)
            return (
              <li key={s.id}>
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">{formatTime(s.started_at)}–{formatTime(s.ended_at!)} · {formatDuration(total)}</span>
                    <span className="block truncate text-xs text-slate-500">{tag && <TagLabel tag={tag} />}{task ? ` · ${task.title}` : ''}{s.comment ? ` · ${s.comment}` : ''}{s.source === 'manual' ? ' · added by hand' : ''}</span>
                  </div>
                  <button type="button" className={`${btn} min-h-9 px-3`} onClick={() => setEditing(editing === s.id ? null : s.id)} aria-label={`Edit session at ${formatTime(s.started_at)}`}>Edit</button>
                  <button type="button" className={`${btnDanger} min-h-9 px-3`} onClick={() => void remove(s.id)} aria-label={`Delete session at ${formatTime(s.started_at)}`}>Delete</button>
                </div>
                {editing === s.id && <SessionEditor session={s} onDone={() => setEditing(null)} />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function Totals() {
  const today = useToday()
  const { weekStartsOn } = useSettings()
  const { areas } = useAreas()
  const intervals = useTimeIntervals()
  const tree = useMemo(() => buildTree(areas), [areas])
  const week = weekBounds(today, weekStartsOn)
  const todayRows = useMemo(() => tagRows(tree, tagMinutes(intervals, today, today)), [tree, intervals, today])
  const weekRows = useMemo(() => tagRows(tree, tagMinutes(intervals, week.start, addDays(week.end, 0))), [tree, intervals, week.start, week.end])

  const block = (title: string, rows: ReturnType<typeof tagRows>) => (
    <div className={card}>
      <h3 className="px-3 pt-3 text-sm font-semibold text-slate-500">{title}</h3>
      {rows.length === 0 ? <p className="px-3 py-2 text-sm text-slate-500">No time yet.</p> : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label={title}>
          {rows.map((r) => (
            <li key={r.tag.id} className="px-3 py-2 text-sm">
              <div className="flex items-center justify-between"><span className="font-medium"><TagLabel tag={r.tag} /></span><b>{formatDuration(r.total)}</b></div>
              {r.general > 0 && r.kids.length > 0 && <div className="flex justify-between pl-4 text-xs text-slate-500"><span>general</span><span>{formatDuration(r.general)}</span></div>}
              {r.kids.map((k) => <div key={k.tag.id} className="flex justify-between pl-4 text-xs text-slate-500"><span><TagLabel tag={k.tag} /></span><span>{formatDuration(k.minutes)}</span></div>)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )

  return (
    <div className="space-y-3">
      <h2 className={sectionTitle}>Totals</h2>
      {block('Today by tag', todayRows)}
      {block('This week by tag', weekRows)}
    </div>
  )
}

