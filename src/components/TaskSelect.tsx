import { useTasks } from '../data/tasks'
import { isOpen, isTopLevel } from '../lib/tasks'
import { select } from './ui'

/** Pick one open task (or none) for a timer session. `keepId` keeps a finished task selectable when editing an old session. */
export function TaskSelect({ value, onChange, keepId, label = 'Task' }: { value: string | null; onChange: (id: string | null) => void; keepId?: string | null; label?: string }) {
  const { tasks } = useTasks()
  const list = tasks.filter((t) => (isTopLevel(t) && isOpen(t)) || t.id === keepId || t.id === value)
  return (
    <select className={select} aria-label={label} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">No task</option>
      {list.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
    </select>
  )
}
