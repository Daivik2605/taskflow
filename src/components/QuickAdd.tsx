import { useState, type FormEvent } from 'react'
import { useConnection } from '../app/connection'
import { Icon } from '../app/Icon'
import { useAreas } from '../data/areas'
import { useTasks } from '../data/tasks'
import { defaultAreaId } from '../lib/areas'
import { TagPicker } from './TagPicker'
import { btnPrimary, input } from './ui'

/** Title + optional day; the tag defaults to Personal (changeable). A day here means "on that day". Enter adds. */
export function QuickAdd({ defaultDue = '' }: { defaultDue?: string }) {
  const { areas } = useAreas()
  const { add } = useTasks()
  const { writesDisabled } = useConnection()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(defaultDue)
  const [tagChoice, setTagChoice] = useState<string | null | undefined>(undefined) // undefined = not touched: use the default
  const [busy, setBusy] = useState(false)
  const areaId = tagChoice === undefined ? defaultAreaId(areas) : tagChoice

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    const row = await add({ title, due_on: due || null, area_id: areaId })
    setBusy(false)
    if (row) { setTitle(''); setDue(defaultDue); setTagChoice(undefined) }
  }

  return (
    <form onSubmit={submit} className="space-y-2" aria-label="Quick add task">
      <div className="flex gap-2">
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" aria-label="Task title" enterKeyHint="done" />
        <button className={`${btnPrimary} flex w-14 items-center justify-center`} disabled={!title.trim() || busy || writesDisabled} aria-label="Add task"><Icon name="plus" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className={input} type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Day (optional)" />
        <TagPicker value={areaId} onChange={setTagChoice} allowNone label="Tag" />
      </div>
    </form>
  )
}
