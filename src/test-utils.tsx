import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { ConnectionProvider } from './app/connection'
import { ToastProvider } from './app/toast'
import { TaskSheetProvider } from './components/TaskSheet'
import { AreasContext, type AreasApi } from './data/areas'
import { ProjectsContext } from './data/projects'
import { TasksContext, type TasksApi } from './data/tasks'
import type { Area } from './lib/areas'
import type { Task } from './lib/tasks'

let n = 0
export function makeTask(over: Partial<Task> = {}): Task {
  n++
  return {
    id: `t${n}`, title: `Task ${n}`, description: null, area_id: 'a-life', project_id: null, parent_id: null, due_on: null,
    priority: 2, status: 'todo', owner: 'me', waiting_on: null, tags: [], completed_at: null, sort: n * 10, from_note_id: null,
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...over,
  }
}

export const AREAS: Area[] = [
  { id: 'a-dsa', name: 'DSA', kind: 'focus', app_key: 'dsa', color: '#6366f1', sort: 0, archived: false },
  { id: 'a-life', name: 'Life admin', kind: 'life', app_key: null, color: '#a3a3a3', sort: 1, archived: false },
]

export function fakeTasksApi(tasks: Task[], over: Partial<TasksApi> = {}): TasksApi {
  return {
    tasks, loading: false,
    add: vi.fn(async () => null), update: vi.fn(async () => true), setDone: vi.fn(async () => true),
    remove: vi.fn(async () => true), reorder: vi.fn(async () => true), ...over,
  }
}

export function renderApp(ui: ReactElement, { tasks, api, areas = AREAS, route = '/' }: { tasks?: Task[]; api?: TasksApi; areas?: Area[]; route?: string } = {}) {
  const tasksApi = api ?? fakeTasksApi(tasks ?? [])
  const areasApi: AreasApi = { areas, loading: false, add: vi.fn(async () => null), update: vi.fn(async () => null), reorder: vi.fn(async () => true) }
  const utils = render(
    <ConnectionProvider>
      <MemoryRouter initialEntries={[route]}>
        <ToastProvider>
          <AreasContext.Provider value={areasApi}>
            <ProjectsContext.Provider value={[{ id: 'p-aeo', name: 'AEO Studio', status: 'active' }]}>
              <TasksContext.Provider value={tasksApi}>
                <TaskSheetProvider>{ui}</TaskSheetProvider>
              </TasksContext.Provider>
            </ProjectsContext.Provider>
          </AreasContext.Provider>
        </ToastProvider>
      </MemoryRouter>
    </ConnectionProvider>,
  )
  return { ...utils, tasksApi, areasApi }
}
