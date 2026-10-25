import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { ConnectionProvider } from './app/connection'
import { ToastProvider } from './app/toast'
import { TaskSheetProvider } from './components/TaskSheet'
import { AreasContext, type AreasApi } from './data/areas'
import { CountersContext, type CountersApi } from './data/counters'
import { ProjectsContext } from './data/projects'
import { SettingsContext } from './data/settings'
import { TasksContext, type TasksApi } from './data/tasks'
import type { Area } from './lib/areas'
import type { Counter, CounterEvent } from './lib/counters'
import { area } from './lib/fixtures'
import type { Task } from './lib/tasks'

export { task as makeTask, done as makeDone } from './lib/fixtures'

export const AREAS: Area[] = [
  area({ id: 'a-study', name: 'Study', kind: 'study', sort: 0, emoji: '📚', color: '#6366f1' }),
  area({ id: 'a-dsa', name: 'DSA', kind: 'study', sort: 0, parent_id: 'a-study', emoji: '🧩', color: '#6366f1', app_key: 'dsa' }),
  area({ id: 'a-sql', name: 'SQL', kind: 'study', sort: 1, parent_id: 'a-study', color: '#0ea5e9' }),
  area({ id: 'a-work', name: 'Work', kind: 'work', sort: 1, emoji: '💼', color: '#dc2626' }),
  area({ id: 'a-personal', name: 'Personal', kind: 'personal', sort: 2, emoji: '🏠', color: '#a3a3a3' }),
]

export const COUNTERS: Counter[] = [
  { id: 'c-cig', name: 'Cigarette', emoji: '🚬', color: '#6b7280', sort: 0, archived: false },
  { id: 'c-weed', name: 'Weed', emoji: '🌿', color: '#22c55e', sort: 1, archived: false },
]

export function fakeTasksApi(tasks: Task[], over: Partial<TasksApi> = {}): TasksApi {
  return {
    tasks, loading: false,
    add: vi.fn(async () => null), update: vi.fn(async () => true), setDone: vi.fn(async () => true),
    remove: vi.fn(async () => true), reorder: vi.fn(async () => true), ...over,
  }
}

export function fakeAreasApi(areas: Area[], over: Partial<AreasApi> = {}): AreasApi {
  return {
    areas, loading: false,
    add: vi.fn(async () => null), update: vi.fn(async () => null), reorder: vi.fn(async () => true), merge: vi.fn(async () => null), ...over,
  }
}

export function fakeCountersApi(counters: Counter[] = COUNTERS, events: CounterEvent[] = [], over: Partial<CountersApi> = {}): CountersApi {
  return {
    counters, events, loading: false,
    tap: vi.fn(async () => null), removeEvent: vi.fn(async () => true), editEvent: vi.fn(async () => true),
    addCounter: vi.fn(async () => null), updateCounter: vi.fn(async () => null), reorderCounters: vi.fn(async () => true), ...over,
  }
}

interface Opts {
  tasks?: Task[]; api?: TasksApi
  areas?: Area[]; areasApi?: AreasApi
  counters?: Counter[]; events?: CounterEvent[]; countersApi?: CountersApi
  route?: string; weekStartsOn?: number
}

export function renderApp(ui: ReactElement, o: Opts = {}) {
  const tasksApi = o.api ?? fakeTasksApi(o.tasks ?? [])
  const areasApi = o.areasApi ?? fakeAreasApi(o.areas ?? AREAS)
  const countersApi = o.countersApi ?? fakeCountersApi(o.counters ?? COUNTERS, o.events ?? [])
  const utils = render(
    <ConnectionProvider>
      <MemoryRouter initialEntries={[o.route ?? '/']}>
        <ToastProvider>
          <SettingsContext.Provider value={{ weekStartsOn: o.weekStartsOn ?? 1, setWeekStartsOn: vi.fn(async () => {}) }}>
            <AreasContext.Provider value={areasApi}>
              <ProjectsContext.Provider value={[{ id: 'p-aeo', name: 'AEO Studio', status: 'active' }]}>
                <CountersContext.Provider value={countersApi}>
                  <TasksContext.Provider value={tasksApi}>
                    <TaskSheetProvider>{ui}</TaskSheetProvider>
                  </TasksContext.Provider>
                </CountersContext.Provider>
              </ProjectsContext.Provider>
            </AreasContext.Provider>
          </SettingsContext.Provider>
        </ToastProvider>
      </MemoryRouter>
    </ConnectionProvider>,
  )
  return { ...utils, tasksApi, areasApi, countersApi }
}

/** jsdom has no <dialog> behaviour yet. */
export function polyfillDialog() {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }
}
