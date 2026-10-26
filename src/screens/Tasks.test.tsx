import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildNewTask } from '../lib/tasks'
import { fakeTasksApi, makeDone, makeTask, polyfillDialog, renderApp } from '../test-utils'
import { Tasks } from './Tasks'

beforeAll(polyfillDialog)
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T15:00:00Z')) })
afterEach(() => vi.useRealTimers())

const tasks = () => [
  makeTask({ title: 'Missed one', due_on: '2026-11-09', area_id: 'a-dsa' }),
  makeTask({ title: 'Due today', start_on: '2026-11-10', due_on: '2026-11-10', area_id: 'a-sql', sort: 10 }),
  makeTask({ title: 'Also today', start_on: '2026-11-10', due_on: '2026-11-10', area_id: 'a-sql', sort: 20 }),
  makeTask({ title: 'Window thing', start_on: '2026-11-08', due_on: '2026-11-14', area_id: 'a-work' }),
  makeTask({ title: 'Deadline soon', due_on: '2026-11-12', hard_deadline: true, area_id: 'a-personal' }),
  makeTask({ title: 'Deadline far', due_on: '2026-12-25', hard_deadline: true }),
  makeTask({ title: 'Starts later', start_on: '2026-11-12', due_on: '2026-11-12' }),
  makeTask({ title: 'Anytime thing', sort: 5 }),
  makeDone('2026-11-10', '2026-11-10T14:00:00Z', { title: 'Finished' }),
  makeTask({ title: 'Dropped one', status: 'dropped' }),
  makeTask({ title: 'Dated sub-task', parent_id: 'p', due_on: '2026-11-10', start_on: '2026-11-10', sort: 30 }),
  makeTask({ title: 'Plain sub-task', parent_id: 'p' }),
]
const headings = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.replace(/\s+/g, ' ').trim())
const shown = (...titles: string[]) => titles.forEach((t) => expect(screen.getByText(t)).toBeInTheDocument())
const hidden = (...titles: string[]) => titles.forEach((t) => expect(screen.queryByText(t)).toBeNull())

describe('Tasks screen views', () => {
  it('has the six views, Today first', () => {
    renderApp(<Tasks />, { tasks: tasks(), route: '/tasks' })
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Today', 'Upcoming', 'Deadlines', 'Anytime', 'Done', 'Dropped'])
    expect(screen.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true')
  })
  it('Today: missed, deadlines coming up, today, in a window — upcoming and far deadlines stay out', () => {
    renderApp(<Tasks />, { tasks: tasks(), route: '/tasks' })
    expect(headings()).toEqual(['Missed · 1', 'Deadlines coming up · 1', 'Today · 3', 'In a window · 1'])
    shown('Missed one', 'Deadline soon', 'Due today', 'Window thing', 'Dated sub-task')
    hidden('Starts later', 'Deadline far', 'Anytime thing', 'Finished', 'Plain sub-task')
  })
  it('Upcoming lists what starts later, by start day', () => {
    renderApp(<Tasks />, { tasks: tasks(), route: '/tasks?view=upcoming' })
    expect(headings()).toEqual(['Thu 12 Nov · 1'])
    shown('Starts later')
  })
  it('Deadlines lists every open deadline, soonest first', () => {
    renderApp(<Tasks />, { tasks: tasks(), route: '/tasks?view=deadlines' })
    expect(headings()).toEqual(['Within 7 days · 1', 'Later · 1'])
    shown('Deadline soon', 'Deadline far')
  })
  it('Anytime lists undated tasks', () => {
    renderApp(<Tasks />, { tasks: tasks(), route: '/tasks?view=anytime' })
    shown('Anytime thing')
    hidden('Missed one', 'Plain sub-task') // a sub-task without its own date lives inside its parent
  })
  it('Done shows finished tasks only; dropped ones are hidden from it', () => {
    renderApp(<Tasks />, { tasks: tasks(), route: '/tasks?view=done' })
    expect(headings()).toEqual(['Today · 1'])
    shown('Finished')
    hidden('Dropped one')
  })
  it('Dropped lists dropped tasks and Restore brings one back as to do', async () => {
    const api = fakeTasksApi(tasks())
    renderApp(<Tasks />, { api, route: '/tasks?view=dropped' })
    expect(headings()).toEqual(['Dropped · 1'])
    hidden('Finished', 'Missed one')
    await userEvent.click(screen.getByRole('button', { name: 'Restore: Dropped one' }))
    expect(api.update).toHaveBeenCalledWith(expect.any(String), { status: 'todo' })
  })
  it('a dropped task shows in no other view', () => {
    for (const v of ['today', 'upcoming', 'deadlines', 'anytime', 'done']) {
      const { unmount } = renderApp(<Tasks />, { tasks: tasks(), route: `/tasks?view=${v}` })
      hidden('Dropped one')
      unmount()
    }
  })
  it('switching view updates the address, so a refresh keeps it', async () => {
    renderApp(<Tasks />, { tasks: tasks(), route: '/tasks' })
    await userEvent.click(screen.getByRole('tab', { name: 'Deadlines' }))
    expect(screen.getByRole('tab', { name: 'Deadlines' })).toHaveAttribute('aria-selected', 'true')
    expect(headings()).toContain('Later · 1')
  })
})

describe('Tasks screen filters', () => {
  it('a parent tag includes its sub-tags', () => {
    renderApp(<Tasks />, { tasks: tasks(), route: '/tasks?tag=a-study' })
    shown('Missed one', 'Due today', 'Also today') // DSA and SQL are Study's sub-tags
    hidden('Window thing', 'Deadline soon')
  })
  it('a sub-tag is just itself', () => {
    renderApp(<Tasks />, { tasks: tasks(), route: '/tasks?tag=a-dsa' })
    shown('Missed one')
    hidden('Due today', 'Also today')
  })
  it('shows a hint and a way out when nothing matches', async () => {
    renderApp(<Tasks />, { tasks: tasks(), route: '/tasks?tag=a-work&view=upcoming' })
    expect(screen.getByText('No tasks match these filters.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    shown('Starts later')
  })
})

describe('Tasks screen ordering', () => {
  it('reorder buttons work within a manually-ordered group and call reorder with the swap', async () => {
    const t = tasks()
    const api = fakeTasksApi(t)
    renderApp(<Tasks />, { api, route: '/tasks' })
    expect(screen.getByRole('button', { name: 'Move up: Due today' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Move up: Also today' }))
    const a = t.find((x) => x.title === 'Due today')!
    const b = t.find((x) => x.title === 'Also today')!
    expect(api.reorder).toHaveBeenCalledWith(expect.arrayContaining([{ id: b.id, sort: expect.any(Number) }, { id: a.id, sort: expect.any(Number) }]))
  })
  it('groups sorted by date (deadlines, missed) have no reorder buttons', () => {
    renderApp(<Tasks />, { tasks: tasks(), route: '/tasks?view=deadlines' })
    expect(screen.queryByRole('button', { name: /Move up/ })).toBeNull()
  })
})

describe('Tasks screen quick add follows the view', () => {
  const addApi = () => fakeTasksApi([], { add: vi.fn(async (input) => buildNewTask(input, 10, new Date(), 'new-id')) })
  const type = async (title: string) => userEvent.type(screen.getByLabelText('Task title'), `${title}{Enter}`)

  it('Today: pre-fills today, and the task shows with no "Added to" toast', async () => {
    const api = addApi()
    renderApp(<Tasks />, { api, route: '/tasks' })
    expect(screen.getByLabelText('Day (optional)')).toHaveValue('2026-11-10')
    await type('Pay rent')
    expect(api.add).toHaveBeenCalledWith({ title: 'Pay rent', due_on: '2026-11-10', area_id: null, hard_deadline: false })
    expect(screen.queryByText(/^Added to/)).toBeNull()
  })
  it('Upcoming: pre-fills tomorrow, and the task shows there', async () => {
    const api = addApi()
    renderApp(<Tasks />, { api, route: '/tasks?view=upcoming' })
    expect(screen.getByLabelText('Day (optional)')).toHaveValue('2026-11-11')
    await type('Dentist')
    expect(api.add).toHaveBeenCalledWith({ title: 'Dentist', due_on: '2026-11-11', area_id: null, hard_deadline: false })
    expect(screen.queryByText(/^Added to/)).toBeNull()
  })
  it('Deadlines: asks for a deadline day, will not add without one, and adds a hard deadline', async () => {
    const api = addApi()
    renderApp(<Tasks />, { api, route: '/tasks?view=deadlines' })
    const day = screen.getByLabelText('Deadline day')
    expect(day).toHaveValue('')
    await userEvent.type(screen.getByLabelText('Task title'), 'Pass G2')
    expect(screen.getByRole('button', { name: 'Add task' })).toBeDisabled()
    await userEvent.type(day, '2026-12-01')
    await userEvent.click(screen.getByRole('button', { name: 'Add task' }))
    expect(api.add).toHaveBeenCalledWith({ title: 'Pass G2', due_on: '2026-12-01', area_id: null, hard_deadline: true })
    expect(screen.queryByText(/^Added to/)).toBeNull()
  })
  it('Anytime: no day, and the task shows there', async () => {
    const api = addApi()
    renderApp(<Tasks />, { api, route: '/tasks?view=anytime' })
    expect(screen.getByLabelText('Day (optional)')).toHaveValue('')
    await type('Research vector DBs')
    expect(api.add).toHaveBeenCalledWith({ title: 'Research vector DBs', due_on: null, area_id: null, hard_deadline: false })
    expect(screen.queryByText(/^Added to/)).toBeNull()
  })
  it('Done: adds undated, says "Added to Anytime", and the button switches to that view', async () => {
    const api = addApi()
    renderApp(<Tasks />, { api, route: '/tasks?view=done' })
    await type('Call bank')
    expect(screen.getByRole('status')).toHaveTextContent('Added to Anytime')
    await userEvent.click(screen.getByRole('button', { name: 'Show Anytime' }))
    expect(screen.getByRole('tab', { name: 'Anytime' })).toHaveAttribute('aria-selected', 'true')
  })
  it('Today with another day typed: "Added to Upcoming" and the button switches', async () => {
    const api = addApi()
    renderApp(<Tasks />, { api, route: '/tasks' })
    const day = screen.getByLabelText('Day (optional)')
    await userEvent.clear(day)
    await userEvent.type(day, '2026-11-20')
    await type('Later thing')
    expect(screen.getByRole('status')).toHaveTextContent('Added to Upcoming')
    await userEvent.click(screen.getByRole('button', { name: 'Show Upcoming' }))
    expect(screen.getByRole('tab', { name: 'Upcoming' })).toHaveAttribute('aria-selected', 'true')
  })
})
