import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeTasksApi, makeTask, renderApp } from '../test-utils'
import { Tasks } from './Tasks'
import { Today } from './Today'

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T15:00:00Z')) }) // Tue 10 Nov, Toronto
afterEach(() => { vi.useRealTimers() })

const tasks = () => [
  makeTask({ title: 'Pass G2', due_on: '2026-11-09' }), // due yesterday
  makeTask({ title: 'Call Mom', due_on: '2026-11-10' }),
  makeTask({ title: 'Someday thing' }),
  makeTask({ title: 'Later thing', due_on: '2026-12-01' }),
  makeTask({ title: 'Already done', due_on: '2026-11-10', status: 'done', completed_at: '2026-11-10T14:00:00Z' }),
  makeTask({ title: 'A sub-task', parent_id: 'x', due_on: '2026-11-09' }),
]

describe('Today', () => {
  it('lists overdue, due today and no-date tasks, and hides later and sub-tasks', () => {
    renderApp(<Today />, { tasks: tasks() })
    const heading = (name: RegExp) => screen.getByRole('heading', { name })
    expect(heading(/^Overdue/)).toBeInTheDocument()
    expect(heading(/^Due today/)).toBeInTheDocument()
    expect(heading(/^No date/)).toBeInTheDocument()
    expect(heading(/^Done today/)).toBeInTheDocument()
    expect(screen.getByText('Pass G2')).toBeInTheDocument()
    expect(screen.getByText('Yesterday')).toBeInTheDocument()
    expect(screen.getByText('Call Mom')).toBeInTheDocument()
    expect(screen.getByText('Someday thing')).toBeInTheDocument()
    expect(screen.queryByText('Later thing')).toBeNull()
    expect(screen.queryByText('A sub-task')).toBeNull()
  })
  it('shows done · missed · left for today, this week and all time', () => {
    renderApp(<Today />, { tasks: tasks() })
    const counters = within(screen.getByRole('group', { name: 'Counters' }))
    expect(counters.getByLabelText('Today done')).toHaveTextContent('1')
    expect(counters.getByLabelText('Today missed')).toHaveTextContent('0')
    expect(counters.getByLabelText('Today left')).toHaveTextContent('1')
    expect(counters.getByLabelText('This week missed')).toHaveTextContent('1') // Pass G2 (Mon 9 Nov)
    expect(counters.getByLabelText('All time left')).toHaveTextContent('4') // G2, Call Mom, Someday, Later
  })
  it('ticking a task completes it', async () => {
    const api = fakeTasksApi(tasks())
    renderApp(<Today />, { api })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark done: Call Mom' }))
    expect(api.setDone).toHaveBeenCalledWith(expect.any(String), true)
  })
  it('un-ticking a finished task re-opens it', async () => {
    const api = fakeTasksApi(tasks())
    renderApp(<Today />, { api })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark not done: Already done' }))
    expect(api.setDone).toHaveBeenCalledWith(expect.any(String), false)
  })
  it('quick add on Today defaults to today and Life admin', async () => {
    const api = fakeTasksApi([])
    renderApp(<Today />, { api })
    expect(screen.getByLabelText('Area')).toHaveValue('a-life')
    await userEvent.type(screen.getByLabelText('Task title'), 'Pass G2{Enter}')
    expect(api.add).toHaveBeenCalledWith({ title: 'Pass G2', due_on: '2026-11-10', area_id: 'a-life' })
  })
  it('says so when there are no tasks at all', () => {
    renderApp(<Today />, { tasks: [] })
    expect(screen.getByText(/No tasks yet/)).toBeInTheDocument()
  })
})

describe('Tasks screen', () => {
  it('groups by due date', () => {
    renderApp(<Tasks />, { tasks: tasks(), route: '/tasks' })
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    // the sub-task with its own due date shows here (under Overdue); the done task is hidden by the default Open filter
    expect(headings).toEqual(['Overdue · 2', 'Today · 1', 'Later · 1', 'No date · 1'])
  })
  it('filters from the URL, and shows closed tasks when asked', () => {
    renderApp(<Tasks />, { tasks: tasks(), route: '/tasks?status=done' })
    expect(screen.getByText('Already done')).toBeInTheDocument()
    expect(screen.queryByText('Pass G2')).toBeNull()
    expect(screen.getByText('Clear filters')).toBeInTheDocument()
  })
  it('filters by due window', () => {
    renderApp(<Tasks />, { tasks: tasks(), route: '/tasks?due=overdue' })
    expect(screen.getByText('Pass G2')).toBeInTheDocument()
    expect(screen.queryByText('Call Mom')).toBeNull()
  })
  it('reorder buttons move a task within its group', async () => {
    const t = [makeTask({ title: 'First', due_on: '2026-12-01', sort: 10 }), makeTask({ title: 'Second', due_on: '2026-12-01', sort: 20 })]
    const api = fakeTasksApi(t)
    renderApp(<Tasks />, { api, route: '/tasks' })
    expect(screen.getByRole('button', { name: 'Move up: First' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Move up: Second' }))
    expect(api.reorder).toHaveBeenCalledWith([{ id: t[1].id, sort: 10 }, { id: t[0].id, sort: 20 }])
  })
})
