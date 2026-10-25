import { useState } from 'react'
import { Icon } from '../../app/Icon'
import { useConnection } from '../../app/connection'
import { TagPicker } from '../../components/TagPicker'
import { btn, btnPrimary, card, input, label, sectionTitle } from '../../components/ui'
import { useActivities } from '../../data/activities'
import { useAreas } from '../../data/areas'
import { activeActivities, byActivitySort, type Activity } from '../../lib/activities'
import { tagPath } from '../../lib/tags'
import { reorderWithin } from '../../lib/tasks'

const toTarget = (text: string): number | null => (text.trim() === '' ? null : Number(text))

function Fields({ name, setName, tag, setTag, minutes, setMinutes, target, setTarget }: {
  name: string; setName: (v: string) => void; tag: string | null; setTag: (v: string | null) => void
  minutes: string; setMinutes: (v: string) => void; target: string; setTarget: (v: string) => void
}) {
  return (
    <>
      <label className={label}>Name<input className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <div className={label}><span className="mb-1 block">Tag (the time counts here)</span><TagPicker value={tag} onChange={setTag} label="Activity tag" /></div>
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>Default minutes<input className={`${input} mt-1`} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
        <label className={label}>Weekly target <span className="font-normal text-slate-500">(optional)</span>
          <input className={`${input} mt-1`} inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="none" /></label>
      </div>
    </>
  )
}

function Editor({ activity, onDone }: { activity: Activity; onDone: () => void }) {
  const { update } = useActivities()
  const { writesDisabled } = useConnection()
  const [name, setName] = useState(activity.name)
  const [tag, setTag] = useState<string | null>(activity.area_id)
  const [minutes, setMinutes] = useState(String(activity.default_minutes))
  const [target, setTarget] = useState(activity.weekly_target === null ? '' : String(activity.weekly_target))
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    if (!tag) { setError('Pick a tag.'); return }
    const e = await update(activity.id, { name, area_id: tag, default_minutes: Number(minutes), weekly_target: toTarget(target) })
    setError(e)
    if (!e) onDone()
  }
  return (
    <div className="space-y-3 border-t border-slate-100 p-3 dark:border-slate-800">
      <Fields {...{ name, setName, tag, setTag, minutes, setMinutes, target, setTarget }} />
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary} disabled={writesDisabled || !name.trim()} onClick={() => void save()}>Save</button>
        <button className={btn} disabled={writesDisabled} onClick={async () => { const e = await update(activity.id, { archived: !activity.archived }); setError(e); if (!e) onDone() }}>{activity.archived ? 'Restore' : 'Hide'}</button>
        <button className={btn} onClick={onDone}>Close</button>
      </div>
    </div>
  )
}

export function ActivitiesSettings() {
  const { activities, loading, add, reorder } = useActivities()
  const { areas } = useAreas()
  const { writesDisabled } = useConnection()
  const [editing, setEditing] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [minutes, setMinutes] = useState('30')
  const [target, setTarget] = useState('')
  const [error, setError] = useState<string | null>(null)

  const active = activeActivities(activities)
  const hidden = activities.filter((a) => a.archived).sort(byActivitySort)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tag) { setError('Pick a tag.'); return }
    const err = await add({ name, area_id: tag, default_minutes: Number(minutes), weekly_target: toTarget(target) })
    setError(err)
    if (!err) { setName(''); setMinutes('30'); setTarget('') }
  }

  const row = (a: Activity, i?: number) => (
    <li key={a.id}>
      <div className="flex items-center gap-1 pl-3 pr-2">
        <button className="min-h-12 min-w-0 flex-1 text-left" onClick={() => setEditing(editing === a.id ? null : a.id)} aria-expanded={editing === a.id} aria-label={`Edit ${a.name}`}>
          <span className="block font-medium">{a.name}</span>
          <span className="block truncate text-xs text-slate-500">{tagPath(areas, a.area_id)} · {a.default_minutes} min{a.weekly_target ? ` · ${a.weekly_target} a week` : ''}</span>
        </button>
        {i !== undefined && (
          <>
            <button aria-label={`Move up: ${a.name}`} disabled={i === 0 || writesDisabled} onClick={() => void reorder(reorderWithin(active, a.id, 'up'))} className="flex h-11 w-10 items-center justify-center text-slate-500 disabled:opacity-25"><Icon name="up" className="h-5 w-5" /></button>
            <button aria-label={`Move down: ${a.name}`} disabled={i === active.length - 1 || writesDisabled} onClick={() => void reorder(reorderWithin(active, a.id, 'down'))} className="flex h-11 w-10 items-center justify-center text-slate-500 disabled:opacity-25"><Icon name="down" className="h-5 w-5" /></button>
          </>
        )}
      </div>
      {editing === a.id && <Editor key={a.id} activity={a} onDone={() => setEditing(null)} />}
    </li>
  )

  return (
    <div>
      <h2 className={sectionTitle}>Activities</h2>
      <p className="mb-2 text-sm text-slate-500">Repeat things you would never add as a task first. One tap on Today logs the default minutes on the tag, ending now. Nothing is ever “missed”.</p>
      {loading ? <p className="text-sm text-slate-500">Loading…</p> : <ul className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>{active.map((a, i) => row(a, i))}</ul>}

      <form onSubmit={submit} className={`${card} mt-3 space-y-3 p-3`} aria-label="Add activity">
        <h3 className="text-sm font-semibold">Add an activity</h3>
        <Fields {...{ name, setName, tag, setTag, minutes, setMinutes, target, setTarget }} />
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button className={btnPrimary} disabled={!name.trim() || writesDisabled}>Add activity</button>
      </form>

      {hidden.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-500">Hidden</h3>
          <ul className={`${card} divide-y divide-slate-100 dark:divide-slate-800`}>{hidden.map((a) => row(a))}</ul>
        </div>
      )}
    </div>
  )
}
