import { useState } from 'react'
import { Icon } from '../../app/Icon'
import { useConnection } from '../../app/connection'
import { btn, btnPrimary, card, input, label, sectionTitle } from '../../components/ui'
import { useCounters } from '../../data/counters'
import { AREA_COLORS } from '../../lib/areas'
import { byCounterSort, type Counter } from '../../lib/counters'
import { reorderWithin } from '../../lib/tasks'
import { Swatches } from './Swatches'

function Editor({ counter, onDone }: { counter: Counter; onDone: () => void }) {
  const { updateCounter } = useCounters()
  const { writesDisabled } = useConnection()
  const [name, setName] = useState(counter.name)
  const [emoji, setEmoji] = useState(counter.emoji ?? '')
  const [error, setError] = useState<string | null>(null)
  const save = async () => { const e = await updateCounter(counter.id, { name, emoji }); setError(e); if (!e) onDone() }
  return (
    <div className="space-y-3 border-t border-slate-100 p-3 dark:border-slate-800">
      <div className="grid grid-cols-[1fr_5rem] gap-3">
        <label className={label}>Name<input className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save() }} /></label>
        <label className={label}>Emoji<input className={`${input} mt-1 text-center`} value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} aria-label="Emoji" /></label>
      </div>
      <div><span className={label}>Colour</span><div className="mt-1"><Swatches value={counter.color} onPick={(c) => void updateCounter(counter.id, { color: c })} /></div></div>
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
  const [emoji, setEmoji] = useState('')
  const [color, setColor] = useState(AREA_COLORS[3])
  const [error, setError] = useState<string | null>(null)

  const active = counters.filter((c) => !c.archived).sort(byCounterSort)
  const archived = counters.filter((c) => c.archived).sort(byCounterSort)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = await addCounter({ name, emoji: emoji || null, color })
    setError(err)
    if (!err) { setName(''); setEmoji('') }
  }

  const row = (c: Counter, i?: number) => (
    <li key={c.id}>
      <div className="flex items-center gap-1 pl-3 pr-2">
        <button className="min-h-12 min-w-0 flex-1 text-left" onClick={() => setEditing(editing === c.id ? null : c.id)} aria-expanded={editing === c.id} aria-label={`Edit ${c.name}`}>
          <span className="mr-2" aria-hidden="true">{c.emoji}</span><span className="font-medium">{c.name}</span>
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
      <p className="mb-2 text-sm text-slate-500">Tap-to-count buttons on Today. Counts only — no time, no cost.</p>
      {loading ? <p className="text-sm text-slate-500">Loading…</p> : <ul className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>{active.map((c, i) => row(c, i))}</ul>}

      <form onSubmit={submit} className={`${card} mt-3 space-y-3 p-3`} aria-label="Add counter">
        <h3 className="text-sm font-semibold">Add a counter</h3>
        <div className="grid grid-cols-[1fr_5rem] gap-3">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="New counter name" />
          <input className={`${input} text-center`} value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="😀" maxLength={4} aria-label="New counter emoji" />
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
