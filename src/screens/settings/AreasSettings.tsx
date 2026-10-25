import { useState } from 'react'
import { btn, btnPrimary, card, input, label, select, sectionTitle } from '../../components/ui'
import { Icon } from '../../app/Icon'
import { useConnection } from '../../app/connection'
import { useAreas } from '../../data/areas'
import { activeAreas, AREA_COLORS, AREA_KINDS, byAreaSort, isHexColor, type Area } from '../../lib/areas'
import { reorderWithin } from '../../lib/tasks'
import type { AreaKind } from '../../lib/seed'

function Swatches({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Colour">
      {AREA_COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value.toLowerCase() === c} aria-label={c} onClick={() => onPick(c)}
          className={`h-9 w-9 rounded-full border-2 ${value.toLowerCase() === c ? 'border-slate-900 dark:border-white' : 'border-transparent'}`} style={{ background: c }} />
      ))}
      <label className="flex h-9 items-center gap-1 text-xs text-slate-500">Custom
        <input type="color" value={isHexColor(value) ? value : '#64748b'} onChange={(e) => onPick(e.target.value)} className="h-9 w-9 rounded border-0 bg-transparent p-0" aria-label="Custom colour" />
      </label>
    </div>
  )
}

function AreaEditor({ area, onDone }: { area: Area; onDone: () => void }) {
  const { update } = useAreas()
  const { writesDisabled } = useConnection()
  const [name, setName] = useState(area.name)
  const [error, setError] = useState<string | null>(null)

  const run = async (patch: Parameters<typeof update>[1]) => setError(await update(area.id, patch))
  const saveName = async () => {
    if (name.trim() === area.name) return onDone()
    const err = await update(area.id, { name })
    setError(err)
    if (!err) onDone()
  }

  return (
    <div className="space-y-3 border-t border-slate-100 p-3 dark:border-slate-800">
      <label className={label}>Name
        <input className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void saveName() }} />
      </label>
      <label className={label}>Kind
        <select className={`${select} mt-1`} value={area.kind} onChange={(e) => void run({ kind: e.target.value as AreaKind })} disabled={writesDisabled}>
          {AREA_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}{k.hint ? ` — ${k.hint}` : ''}</option>)}
        </select>
      </label>
      <div><span className={label}>Colour</span><div className="mt-1"><Swatches value={area.color} onPick={(c) => void run({ color: c })} /></div></div>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={writesDisabled || !name.trim()} onClick={() => void saveName()}>Save name</button>
        <button className={btn} disabled={writesDisabled} onClick={() => void run({ archived: !area.archived }).then(onDone)}>{area.archived ? 'Restore' : 'Archive'}</button>
        <button className={btn} onClick={onDone}>Close</button>
      </div>
    </div>
  )
}

export function AreasSettings() {
  const { areas, loading, add, reorder } = useAreas()
  const { writesDisabled } = useConnection()
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<AreaKind>('focus')
  const [color, setColor] = useState(AREA_COLORS[0])
  const [error, setError] = useState<string | null>(null)

  const active = activeAreas(areas)
  const archived = areas.filter((a) => a.archived).sort(byAreaSort)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = await add({ name, kind, color })
    setError(err)
    if (!err) setName('')
  }

  const row = (a: Area, i?: number) => (
    <li key={a.id}>
      <div className="flex items-center gap-1 px-2">
        <span className="mx-2 h-3 w-3 shrink-0 rounded-full" style={{ background: a.color }} aria-hidden="true" />
        <button className="min-h-12 min-w-0 flex-1 text-left" onClick={() => setEditing(editing === a.id ? null : a.id)} aria-expanded={editing === a.id}>
          <span className="block truncate font-medium">{a.name}</span>
          <span className="block text-xs text-slate-500">{AREA_KINDS.find((k) => k.value === a.kind)?.label}{a.app_key ? ` · linked to ${a.app_key}` : ''}</span>
        </button>
        {i !== undefined && (
          <div className="flex shrink-0">
            <button aria-label={`Move up: ${a.name}`} disabled={i === 0 || writesDisabled} onClick={() => void reorder(reorderWithin(active, a.id, 'up'))} className="flex h-11 w-11 items-center justify-center text-slate-500 disabled:opacity-25"><Icon name="up" className="h-5 w-5" /></button>
            <button aria-label={`Move down: ${a.name}`} disabled={i === active.length - 1 || writesDisabled} onClick={() => void reorder(reorderWithin(active, a.id, 'down'))} className="flex h-11 w-11 items-center justify-center text-slate-500 disabled:opacity-25"><Icon name="down" className="h-5 w-5" /></button>
          </div>
        )}
      </div>
      {editing === a.id && <AreaEditor area={a} onDone={() => setEditing(null)} />}
    </li>
  )

  return (
    <div>
      <h2 className={sectionTitle}>Areas</h2>
      {loading ? <p className="text-sm text-slate-500">Loading…</p> : (
        <ul className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>{active.map((a, i) => row(a, i))}</ul>
      )}

      <form onSubmit={submit} className={`${card} mt-3 space-y-3 p-3`} aria-label="Add area">
        <h3 className="text-sm font-semibold">Add an area</h3>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="New area name" />
        <select className={select} value={kind} onChange={(e) => setKind(e.target.value as AreaKind)} aria-label="New area kind">
          {AREA_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}{k.hint ? ` — ${k.hint}` : ''}</option>)}
        </select>
        <Swatches value={color} onPick={setColor} />
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button className={btnPrimary} disabled={!name.trim() || writesDisabled}>Add area</button>
      </form>

      {archived.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-500">Archived</h3>
          <ul className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>{archived.map((a) => row(a))}</ul>
        </div>
      )}
    </div>
  )
}
