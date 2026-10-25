// Small factories shared by unit tests.
import type { Area } from './areas'
import type { Task } from './tasks'

export const area = (over: Partial<Area> & { id: string; name: string }): Area => ({
  kind: 'personal', app_key: null, color: '#64748b', emoji: null, sort: 0, archived: false, parent_id: null, ...over,
})

let n = 0
export function task(over: Partial<Task> = {}): Task {
  n++
  return {
    id: `t${n}`, title: `Task ${n}`, description: null, area_id: null, project_id: null, parent_id: null,
    start_on: null, due_on: null, hard_deadline: false, estimate_minutes: null,
    priority: 2, status: 'todo', owner: 'me', waiting_on: null, tags: [], completed_at: null, sort: 0, from_note_id: null,
    created_at: `2026-10-01T00:00:${String(n % 60).padStart(2, '0')}Z`, updated_at: '2026-10-01T00:00:00Z', ...over,
  }
}

export const done = (due: string | null, completed_at: string, over: Partial<Task> = {}) =>
  task({ due_on: due, status: 'done', completed_at, ...over })
