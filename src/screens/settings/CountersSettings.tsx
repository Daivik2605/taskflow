import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../app/Icon'
import { useConnection } from '../../app/connection'
import { btn, btnPrimary, card, input, label, sectionTitle } from '../../components/ui'
import { useCounters } from '../../data/counters'
import { AREA_COLORS } from '../../lib/areas'
import { byCounterSort, cleanReasons, MAX_REASON_LENGTH, type Counter } from '../../lib/counters'
import { reorderWithin } from '../../lib/tasks'
import { Swatches } from './Swatches'

/** The chips offered after a tap. Edited as a list: add, remove, move up. Changes save when you press Save reasons. */
function ReasonsEditor({ counter }: { counter: Counter }) {
  const { updateCounter } = useCounters()
  const { writesDisabled } = useConnection()
  const [list, setList] = useState<string[]>(counter.reasons ?? [])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const change = (next: string[]) => { setList(next); setSaved(false) }
  const addDraft = () => { const next = cleanReasons([...list, draft]); if (next.length !== list.length) change(next); setDraft('') }
  const move = (i: number) => { if (i === 0) return; const n = [...list]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; change(n) }
  const save = async () => { const e = await updateCounter(counter.id, { reasons: list }); setError(e); setSaved(!e) }
  return (
    <div className="space-y-2" role="group" aria-label={`Reasons for ${counter.name}`}>
      <span className={label}>Reasons <span className="font-normal text-slate-500">(optional chips after a tap)</span></span>
      {list.length === 0 && <p className="text-sm text-slate-500">None. No chips are shown.</p>}
      <ul className="flex flex-wrap gap-1.5">
        {list.map((r, i) => (
          <li key={r} className="flex items-center rounded-full border border-slate-300 text-sm dark:border-slate-700">
            <button type="button" aria-label={`Move ${r} earlier`} disabled={i === 0} onClick={() => move(i)} className="min-h-9 pl-3 pr-1 text-slate-500 disabled:opacity-30"><Icon name="up" className="h-4 w-4 -rotate-90" /></button>
            <span className="px-1">{r}</span>
            <button type="button" aria-label={`Remove ${r}`} onClick={() => change(list.filter((x) => x !== r))} className="min-h-9 min-w-9 pr-1 text-slate-500">✕</button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input className={input} value={draft} maxLength={MAX_REASON_LENGTH} placeholder="Add a reason" aria-label={`New reason for ${counter.name}`} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDraft() } }} />
        <button type="button" className={btn} disabled={!draft.trim()} onClick={addDraft}>Add</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <button type="button" className={btn} disabled={writesDisabled} onClick={() => void save()}>Save reasons</button>
      {saved && <span role="status" className="ml-2 text-sm text-emerald-700 dark:text-emerald-400">Saved</span>}
    </div>
  )
}

function Editor({ counter, onDone }: { counter: Counter; onDone: () => void }) {
  const { updateCounter } = useCounters()
  const { writesDisabled } = useConnection()
  const [name, setName] = useState(counter.name)
  const [shortLabel, setShortLabel] = useState(counter.short_label ?? '')
  const [error, setError] = useState<string | null>(null)
  const save = async () => { const e = await updateCounter(counter.id, { name, short_label: shortLabel }); setError(e); if (!e) onDone() }
  return (
    <div className="space-y-3 border-t border-slate-100 p-3 dark:border-slate-800">
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <label className={label}>Name<input className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save() }} /></label>
        <label className={label}>Short label<input className={`${input} mt-1`} value={shortLabel} onChange={(e) => setShortLabel(e.target.value)} maxLength={8} aria-label="Short label" placeholder={name.slice(0, 4)} /></label>
      </div>
      <div><span className={label}>Colour</span><div className="mt-1"><Swatches value={counter.color} onPick={(c) => void updateCounter(counter.id, { color: c })} /></div></div>
      <ReasonsEditor counter={counter} />
      <Link to={`/settings?goal=counter_count:${counter.id}`} className="inline-block text-sm text-indigo-600 dark:text-indigo-400">Set a goal for {counter.name} →</Link>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary} disabled={writesDisabled || !name.trim()} onClick={() => void save()}>Save</button>
        <button className={btn} disabled={writesDisabled} onClick={async () => { const e = await updateCounter(counter.id, { archived: !counter.archived }); setError(e); if (!e) onDone() }}>{counter.archived ? 'Restore' : 'Archive'}</button>
        <button className={btn} onClick={onDone}>Close</button>
      </div>
    </div>
  )
}

export function CountersSettings() {
  const { counters, loading, addCounter, reorderCounters } = useCounters()
  const { writesDisabled } = useConnection()
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [shortLabel, setShortLabel] = useState('')
  const [color, setColor] = useState(AREA_COLORS[3])
  const [error, setError] = useState<string | null>(null)

  const active = counters.filter((c) => !c.archived).sort(byCounterSort)
  const archived = counters.filter((c) => c.archived).sort(byCounterSort)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = await addCounter({ name, short_label: shortLabel || null, color })
    setError(err)
    if (!err) { setName(''); setShortLabel('') }
  }

  const row = (c: Counter, i?: number) => (
    <li key={c.id}>
      <div className="flex items-center gap-1 pl-3 pr-2">
        <button className="min-h-12 min-w-0 flex-1 text-left" onClick={() => setEditing(editing === c.id ? null : c.id)} aria-expanded={editing === c.id} aria-label={`Edit ${c.name}`}>
          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.color }} aria-hidden="true" /><span className="font-medium">{c.name}</span>{c.short_label && <span className="ml-2 text-xs text-slate-500">shown as {c.short_label}</span>}
        </button>
        {i !== undefined && (
          <>
            <button aria-label={`Move up: ${c.name}`} disabled={i === 0 || writesDisabled} onClick={() => void reorderCounters(reorderWithin(active, c.id, 'up'))} className="flex h-11 w-10 items-center justify-center text-slate-500 disabled:opacity-25"><Icon name="up" className="h-5 w-5" /></button>
            <button aria-label={`Move down: ${c.name}`} disabled={i === active.length - 1 || writesDisabled} onClick={() => void reorderCounters(reorderWithin(active, c.id, 'down'))} className="flex h-11 w-10 items-center justify-center text-slate-500 disabled:opacity-25"><Icon name="down" className="h-5 w-5" /></button>
          </>
        )}
      </div>
      {editing === c.id && <Editor counter={c} onDone={() => setEditing(null)} />}
    </li>
  )

  return (
    <div>
      <h2 className={sectionTitle}>Counters</h2>
      <p className="mb-2 text-sm text-slate-500">Counter pills in the header of every screen. The short label is what the pill shows (the full name is used if it is empty). Counts only — no time, no cost.</p>
      {loading ? <p className="text-sm text-slate-500">Loading…</p> : <ul className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>{active.map((c, i) => row(c, i))}</ul>}

      <form onSubmit={submit} className={`${card} mt-3 space-y-3 p-3`} aria-label="Add counter">
        <h3 className="text-sm font-semibold">Add a counter</h3>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="New counter name" />
          <input className={input} value={shortLabel} onChange={(e) => setShortLabel(e.target.value)} placeholder="Short label" maxLength={8} aria-label="New counter short label" />
        </div>
        <Swatches value={color} onPick={setColor} />
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button className={btnPrimary} disabled={!name.trim() || writesDisabled}>Add counter</button>
      </form>

      {archived.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-500">Archived</h3>
          <ul className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>{archived.map((c) => row(c))}</ul>
        </div>
      )}
    </div>
  )
}
