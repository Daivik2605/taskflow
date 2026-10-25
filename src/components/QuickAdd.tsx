import { useState, type FormEvent } from 'react'
import { useConnection } from '../app/connection'
import { Icon } from '../app/Icon'
import { useAreas } from '../data/areas'
import { useTasks } from '../data/tasks'
import { activeAreas, defaultAreaId } from '../lib/areas'
import { btnPrimary, input, select } from './ui'

/** Title + optional due date; area defaults to Life admin (changeable). Enter adds. */
export function QuickAdd({ defaultDue = '' }: { defaultDue?: string }) {
  const { areas } = useAreas()
  const { add } = useTasks()
  const { writesDisabled } = useConnection()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState(defaultDue)
  const [areaChoice, setAreaChoice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const areaId = areaChoice ?? defaultAreaId(areas) ?? ''

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || busy) return
    setBusy(true)
    const row = await add({ title, due_on: due || null, area_id: areaId || null })
    setBusy(false)
    if (row) { setTitle(''); setDue(defaultDue); setAreaChoice(null) }
  }

  return (
    <form onSubmit={submit} className="space-y-2" aria-label="Quick add task">
      <div className="flex gap-2">
        <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" aria-label="Task title" enterKeyHint="done" />
        <button className={`${btnPrimary} flex w-14 items-center justify-center`} disabled={!title.trim() || busy || writesDisabled} aria-label="Add task"><Icon name="plus" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className={input} type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date (optional)" />
        <select className={select} value={areaId} onChange={(e) => setAreaChoice(e.target.value)} aria-label="Area">
          {activeAreas(areas).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
    </form>
  )
}
