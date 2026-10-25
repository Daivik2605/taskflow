import { useState, type FormEvent } from 'react'
import { useConnection } from '../app/connection'
import { Icon } from '../app/Icon'
import { useTasks } from '../data/tasks'
import { TagPicker } from './TagPicker'
import { btnPrimary, input } from './ui'

/** Title + optional day + optional tag (only the task tags; none by default). A day here means "on that day". Enter adds. */
export function QuickAdd({ defaultDue = '' }: { defaultDue?: string }) {
  const { add } = useTasks()
  const { writesDisabled } = useConnection()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(defaultDue)
  const [areaId, setAreaId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    const row = await add({ title, due_on: due || null, area_id: areaId })
    setBusy(false)
    if (row) { setTitle(''); setDue(defaultDue); setAreaId(null) }
  }

  return (
    <form onSubmit={submit} className="space-y-2" aria-label="Quick add task">
      <div className="flex gap-2">
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" aria-label="Task title" enterKeyHint="done" />
        <button className={`${btnPrimary} flex w-14 items-center justify-center`} disabled={!title.trim() || busy || writesDisabled} aria-label="Add task"><Icon name="plus" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className={input} type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Day (optional)" />
        <TagPicker value={areaId} onChange={setAreaId} allowNone tasksOnly label="Tag" />
      </div>
    </form>
  )
}
