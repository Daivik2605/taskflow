import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeTasksApi, makeDone, makeTask, polyfillDialog, renderApp } from '../test-utils'
import { Today } from './Today'

beforeAll(polyfillDialog)
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T15:00:00Z')) }) // Tue 10 Nov, Toronto
afterEach(() => { vi.useRealTimers(); localStorage.clear() })

const tasks = () => [
  makeTask({ title: 'Pass G2', due_on: '2026-11-09' }), // missed (made before revision 2: no start day)
  makeTask({ title: 'Renew passport', due_on: '2026-11-08', hard_deadline: true }), // missed deadline
  makeTask({ title: 'Call Mom', start_on: '2026-11-10', due_on: '2026-11-10' }),
  makeTask({ title: 'Finish week 3', start_on: '2026-11-08', due_on: '2026-11-14' }), // in a window
  makeTask({ title: 'Tax return', due_on: '2026-11-20', hard_deadline: true }), // deadline in 10 days
  makeTask({ title: 'Far deadline', due_on: '2026-12-31', hard_deadline: true }), // not within 14 days
  makeTask({ title: 'Starts later', start_on: '2026-11-12', due_on: '2026-11-12' }), // upcoming
  makeTask({ title: 'Someday thing' }),
  makeDone('2026-11-10', '2026-11-10T14:00:00Z', { title: 'Already done' }),
  makeTask({ title: 'A sub-task', parent_id: 'x', due_on: '2026-11-09' }),
]

const headings = () => screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.replace(/\s+/g, ' ').trim())

describe('Today', () => {
  it('lists missed, deadlines in the next 14 days, today, in a window, no date, done today', () => {
    renderApp(<Today />, { tasks: tasks() })
    expect(headings()).toEqual([
      'Missed · 2 reschedule or drop', 'Deadlines in the next 14 days · 1', 'Today · 1', 'In a window · 1', 'No date · 1', 'Done today · 1'])
  })
  it('hides upcoming tasks, far deadlines and sub-tasks', () => {
    renderApp(<Today />, { tasks: tasks() })
    for (const t of ['Starts later', 'Far deadline', 'A sub-task']) expect(screen.queryByText(t)).toBeNull()
    for (const t of ['Pass G2', 'Renew passport', 'Call Mom', 'Finish week 3', 'Tax return', 'Someday thing', 'Already done']) expect(screen.getByText(t)).toBeInTheDocument()
  })
  it('shows chips: missed, deadline countdown, window days left, today', () => {
    renderApp(<Today />, { tasks: tasks() })
    const chipOf = (title: string) => within(screen.getByText(title).closest('li')!)
    expect(chipOf('Pass G2').getByText('Missed')).toBeInTheDocument()
    expect(screen.getByText('⚑ Deadline missed')).toBeInTheDocument()
    expect(screen.getByText('⚑ Deadline in 10 days')).toBeInTheDocument()
    expect(screen.getByText('Window · 5 days left')).toBeInTheDocument()
    expect(chipOf('Call Mom').getByText('Today')).toBeInTheDocument()
  })
  it('ticking a task completes it; un-ticking a finished one re-opens it', async () => {
    const api = fakeTasksApi(tasks())
    renderApp(<Today />, { api })
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark done: Call Mom' }))
    expect(api.setDone).toHaveBeenCalledWith(expect.any(String), true)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark not done: Already done' }))
    expect(api.setDone).toHaveBeenLastCalledWith(expect.any(String), false)
  })
  it('missed tasks can be moved to today, rescheduled or dropped; a missed deadline cannot just be moved', async () => {
    const api = fakeTasksApi(tasks())
    renderApp(<Today />, { api })
    const pass = screen.getByText('Pass G2').closest('li')!
    await userEvent.click(within(pass).getByRole('button', { name: 'Do today' }))
    expect(api.update).toHaveBeenCalledWith(api.tasks.find((t) => t.title === 'Pass G2')!.id, { due_on: '2026-11-10' })
    await userEvent.click(within(pass).getByRole('button', { name: 'Drop' }))
    expect(api.update).toHaveBeenLastCalledWith(expect.any(String), { status: 'dropped' })
    const passport = screen.getByText('Renew passport').closest('li')!
    expect(within(passport).queryByRole('button', { name: 'Do today' })).toBeNull()
    await userEvent.click(within(passport).getByRole('button', { name: 'Reschedule' }))
    expect(await screen.findByLabelText('Title')).toHaveValue('Renew passport')
  })
  it('quick add on Today defaults to today and the Personal tag', async () => {
    const api = fakeTasksApi([])
    renderApp(<Today />, { api })
    expect(screen.getByRole('button', { name: 'Tag' })).toHaveTextContent('Personal')
    await userEvent.type(screen.getByLabelText('Task title'), 'Pass G2{Enter}')
    expect(api.add).toHaveBeenCalledWith({ title: 'Pass G2', due_on: '2026-11-10', area_id: 'a-personal' })
  })
  it('says so when there are no tasks at all', () => {
    renderApp(<Today />, { tasks: [] })
    expect(screen.getByText(/No tasks yet/)).toBeInTheDocument()
  })
  it('puts the counter buttons above everything else', () => {
    renderApp(<Today />, { tasks: [] })
    const group = screen.getByRole('group', { name: 'Counters' })
    const form = screen.getByRole('form', { name: 'Quick add task' })
    expect(group.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(group).getAllByRole('button', { name: /Tap to add one/ })).toHaveLength(2)
  })
})
