import { useState, type FormEvent } from 'react'
import { Icon } from '../app/Icon'
import { useTasks } from '../data/tasks'
import type { Task } from '../lib/tasks'
import { TagPicker } from './TagPicker'
import { btnPrimary, input } from './ui'

/** Title + optional day + optional tag (only the task tags; none by default). A day here means "on that day". Enter adds. */
export function QuickAdd({ defaultDue = '', deadline = false, onAdded }: { defaultDue?: string; /** The day field is a hard deadline (Tasks → Deadlines). */ deadline?: boolean; onAdded?: (task: Task) => void }) {
  const { add } = useTasks()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(defaultDue)
  const [areaId, setAreaId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || busy || (deadline && !due)) return
    setBusy(true)
    const row = await add({ title, due_on: due || null, area_id: areaId, hard_deadline: deadline })
    setBusy(false)
    if (row) { setTitle(''); setDue(defaultDue); setAreaId(null); onAdded?.(row) }
  }

  return (
    <form onSubmit={submit} className="space-y-2" aria-label="Quick add task">
      <div className="flex gap-2">
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" aria-label="Task title" enterKeyHint="done" />
        <button className={`${btnPrimary} flex w-14 items-center justify-center`} disabled={!title.trim() || busy || (deadline && !due)} aria-label="Add task"><Icon name="plus" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className={input} type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label={deadline ? 'Deadline day' : 'Day (optional)'} />
        <TagPicker value={areaId} onChange={setAreaId} allowNone tasksOnly label="Tag" />
      </div>
    </form>
  )
}
