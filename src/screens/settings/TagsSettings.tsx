import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../app/Icon'
import { useConnection } from '../../app/connection'
import { TagLabel } from '../../components/TagLabel'
import { btn, btnDanger, btnPrimary, card, input, label, select, sectionTitle } from '../../components/ui'
import { useAreas } from '../../data/areas'
import { AREA_COLORS, TAG_KINDS, type Area, type TagKind } from '../../lib/areas'
import { buildTree, siblingsOf, tagPath, tagPurpose, validateMerge } from '../../lib/tags'
import { reorderWithin } from '../../lib/tasks'
import { Swatches } from './Swatches'

function Editor({ tag, onDone }: { tag: Area; onDone: () => void }) {
  const { areas, update, merge } = useAreas()
  const { writesDisabled } = useConnection()
  const [name, setName] = useState(tag.name)
  const [error, setError] = useState<string | null>(null)
  const [mergeInto, setMergeInto] = useState('')
  const [confirmMerge, setConfirmMerge] = useState(false)

  const hasChildren = areas.some((a) => a.parent_id === tag.id)
  const activeChildren = areas.some((a) => a.parent_id === tag.id && !a.archived)
  const parents = areas.filter((a) => a.parent_id === null && a.id !== tag.id && !a.archived)
  const targets = areas.filter((a) => a.id !== tag.id && !a.archived && validateMerge(areas, tag.id, a.id) === null)
  const run = async (p: Parameters<typeof update>[1]) => setError(await update(tag.id, p))
  const saveText = async () => {
    const err = await update(tag.id, { name })
    setError(err)
    if (!err) onDone()
  }

  return (
    <div className="space-y-3 border-t border-slate-100 p-3 dark:border-slate-800">
      <label className={label}>Name
        <input className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void saveText() }} />
      </label>

      <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
        <input type="checkbox" className="h-5 w-5" checked={tag.show_for_tasks} disabled={writesDisabled} onChange={(e) => void run({ show_for_tasks: e.target.checked })} />
        <span>Show when adding a task <span className="font-normal text-slate-500">(task sheet and quick add; "More tags…" and the timer always list every tag)</span></span>
      </label>

      <div><span className={label}>Colour</span><div className="mt-1"><Swatches value={tag.color} onPick={(c) => void run({ color: c })} /></div></div>

      {tag.parent_id === null ? (
        <label className={label}>Kind <span className="font-normal text-slate-500">(its sub-tags follow)</span>
          <select className={`${select} mt-1`} value={tag.kind} disabled={writesDisabled} onChange={(e) => void run({ kind: e.target.value as TagKind })}>
            {TAG_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}{k.hint ? ` — ${k.hint}` : ''}</option>)}
          </select>
        </label>
      ) : (
        <p className="text-sm text-slate-500">Kind: {TAG_KINDS.find((k) => k.value === tag.kind)?.label} — inherited from its parent.</p>
      )}

      {!hasChildren && (
        <label className={label}>Parent
          <select className={`${select} mt-1`} value={tag.parent_id ?? ''} disabled={writesDisabled} onChange={(e) => void run({ parent_id: e.target.value || null })}>
            <option value="">None — a top-level tag</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      {hasChildren && <p className="text-sm text-slate-500">This tag has sub-tags, so it stays top-level.</p>}

      <Link to={`/settings?goal=tag_minutes:${tag.id}`} className="inline-block text-sm text-indigo-600 dark:text-indigo-400">Set a time goal for {tag.name} →</Link>

      <div className="space-y-2 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
        {activeChildren && <p className="text-sm text-slate-500">To merge this tag into another, first move or archive its sub-tags.</p>}
        {!activeChildren && <label className={label}>Merge into another tag
          <select className={`${select} mt-1`} value={mergeInto} onChange={(e) => { setMergeInto(e.target.value); setConfirmMerge(false) }} aria-label="Merge into">
            <option value="">Choose a tag…</option>
            {targets.map((t) => <option key={t.id} value={t.id}>{tagPath(areas, t.id)}</option>)}
          </select>
        </label>}
        {mergeInto && !confirmMerge && <button className={btn} disabled={writesDisabled} onClick={() => setConfirmMerge(true)}>Merge…</button>}
        {mergeInto && confirmMerge && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="flex-1">Move every task, preset, session and note from “{tag.name}” to “{tagPath(areas, mergeInto)}”, then archive “{tag.name}”?</span>
            <button className={btnDanger} onClick={async () => { const e = await merge(tag.id, mergeInto); setError(e); if (!e) onDone() }}>Yes, merge</button>
            <button className={btn} onClick={() => setConfirmMerge(false)}>Keep both</button>
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary} disabled={writesDisabled || !name.trim()} onClick={() => void saveText()}>Save</button>
        <button className={btn} disabled={writesDisabled} onClick={async () => { const e = await update(tag.id, { archived: !tag.archived }); setError(e); if (!e) onDone() }}>{tag.archived ? 'Restore' : 'Archive'}</button>
        <button className={btn} onClick={onDone}>Close</button>
      </div>
    </div>
  )
}

function AddForm({ parent, onDone }: { parent: Area | null; onDone: () => void }) {
  const { add } = useAreas()
  const { writesDisabled } = useConnection()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<TagKind>('personal')
  const [color, setColor] = useState(parent?.color ?? AREA_COLORS[0])
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const err = await add({ name, parent_id: parent?.id ?? null, kind, color })
    setError(err)
    if (!err) { setName(''); onDone() }
  }
  return (
    <form onSubmit={submit} className="space-y-3 border-t border-slate-100 p-3 dark:border-slate-800" aria-label={parent ? `Add a sub-tag to ${parent.name}` : 'Add a parent tag'}>
      <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder={parent ? 'Sub-tag name' : 'Parent tag name'} aria-label="Name" />
      {!parent && (
        <select className={select} value={kind} onChange={(e) => setKind(e.target.value as TagKind)} aria-label="Kind">
          {TAG_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}{k.hint ? ` — ${k.hint}` : ''}</option>)}
        </select>
      )}
      <Swatches value={color} onPick={setColor} />
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={!name.trim() || writesDisabled}>{parent ? 'Add sub-tag' : 'Add parent tag'}</button>
        <button type="button" className={btn} onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}

export function TagsSettings() {
  const { areas, loading, reorder } = useAreas()
  const { writesDisabled } = useConnection()
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | 'parent' | null>(null)

  const tree = buildTree(areas, { includeArchived: false })
  const archived = areas.filter((a) => a.archived).sort((a, b) => a.name.localeCompare(b.name))

  const move = (a: Area, dir: 'up' | 'down') => void reorder(reorderWithin(siblingsOf(areas, a.parent_id), a.id, dir))

  const row = (a: Area, sibs: Area[], i: number, indent: boolean) => (
    <li key={a.id}>
      <div className={`flex items-center gap-1 pr-2 ${indent ? 'pl-8' : 'pl-3'}`}>
        <button className="min-h-12 min-w-0 flex-1 text-left" onClick={() => setEditing(editing === a.id ? null : a.id)} aria-expanded={editing === a.id} aria-label={`Edit ${a.name}`}>
          <span className={`block truncate ${indent ? '' : 'font-semibold'}`}><TagLabel tag={a} /></span>
          <span className="block text-xs text-slate-500">{tagPurpose(a)}</span>
          <span className="block text-xs text-slate-500">{[indent ? '' : TAG_KINDS.find((k) => k.value === a.kind)?.label, a.app_key ? `linked to ${a.app_key}` : '', a.show_for_tasks ? 'on tasks' : ''].filter(Boolean).join(' · ')}</span>
        </button>
        <button aria-label={`Move up: ${a.name}`} disabled={i === 0 || writesDisabled} onClick={() => move(a, 'up')} className="flex h-11 w-10 items-center justify-center text-slate-500 disabled:opacity-25"><Icon name="up" className="h-5 w-5" /></button>
        <button aria-label={`Move down: ${a.name}`} disabled={i === sibs.length - 1 || writesDisabled} onClick={() => move(a, 'down')} className="flex h-11 w-10 items-center justify-center text-slate-500 disabled:opacity-25"><Icon name="down" className="h-5 w-5" /></button>
      </div>
      {editing === a.id && <Editor key={a.id} tag={a} onDone={() => setEditing(null)} />}
    </li>
  )

  return (
    <div>
      <h2 className={sectionTitle}>Tags</h2>
      <p className="mb-2 text-sm text-slate-500">Every timed thing has one tag, so totals always add up. Sub-tags take their parent's kind.</p>
      {loading ? <p className="text-sm text-slate-500">Loading…</p> : (
        <div className="space-y-3">
          {tree.map((n, pi) => (
            <div key={n.tag.id} className={card}>
              <ul>
                {row(n.tag, tree.map((t) => t.tag), pi, false)}
                {n.children.map((c, ci) => row(c, n.children, ci, true))}
              </ul>
              {adding === n.tag.id
                ? <AddForm parent={n.tag} onDone={() => setAdding(null)} />
                : <button className="min-h-11 w-full border-t border-slate-100 px-3 text-left text-sm text-indigo-600 dark:border-slate-800 dark:text-indigo-400" onClick={() => setAdding(n.tag.id)} aria-label={`Add a sub-tag to ${n.tag.name}`}>+ Add sub-tag</button>}
            </div>
          ))}
          <div className={card}>
            {adding === 'parent'
              ? <AddForm parent={null} onDone={() => setAdding(null)} />
              : <button className="min-h-12 w-full px-3 text-left text-sm font-medium text-indigo-600 dark:text-indigo-400" onClick={() => setAdding('parent')}>+ Add parent tag</button>}
          </div>
        </div>
      )}

      {archived.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-500">Archived</h3>
          <ul className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>
            {archived.map((a) => (
              <li key={a.id}>
                <button className="flex min-h-12 w-full items-center px-3 text-left" onClick={() => setEditing(editing === a.id ? null : a.id)} aria-expanded={editing === a.id} aria-label={`Edit ${a.name}`}>
                  <span className="min-w-0 flex-1 truncate text-slate-500"><TagLabel tag={a} /> {a.parent_id && <span className="text-xs">in {areas.find((p) => p.id === a.parent_id)?.name}</span>}</span>
                </button>
                {editing === a.id && <Editor key={a.id} tag={a} onDone={() => setEditing(null)} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
