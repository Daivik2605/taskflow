import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { dayRow, fakeDaysApi, fakeTasksApi, makeDone, makeTask, polyfillDialog, renderApp } from '../test-utils'
import { Shutdown } from './Shutdown'
import { Today } from './Today'

beforeAll(polyfillDialog)
afterEach(() => { vi.useRealTimers(); localStorage.clear() })
const at = (iso: string) => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(iso)) }

const TODAY = '2026-11-10'
const tasks = () => [
  makeTask({ title: 'Call Mom', start_on: TODAY, due_on: TODAY }),
  makeTask({ title: 'Old missed', due_on: '2026-11-07' }),
  makeTask({ title: 'Renew passport', due_on: TODAY, hard_deadline: true }),
  makeTask({ title: 'Already dropped', due_on: TODAY, status: 'dropped' }),
  makeDone(TODAY, '2026-11-10T14:00:00Z', { title: 'Finished today' }),
]

describe('morning plan', () => {
  beforeEach(() => at('2026-11-10T12:00:00Z'))

  it('picks up to three, numbers them, refuses a fourth and saves the plan with energy', async () => {
    const days = fakeDaysApi()
    const many = [...tasks(), makeTask({ title: 'Fourth', due_on: TODAY })]
    renderApp(<Today />, { tasks: many, daysApi: days })
    const plan = within(screen.getByRole('region', { name: 'Plan the day' }))
    for (const t of ['Call Mom', 'Old missed', 'Renew passport']) await userEvent.click(plan.getByRole('button', { name: `Add to Top 3: ${t}` }))
    expect(plan.getByRole('button', { name: 'Add to Top 3: Fourth' })).toBeDisabled()
    await userEvent.click(plan.getByRole('radio', { name: '4' }))
    await userEvent.click(plan.getByRole('button', { name: 'Save plan' }))
    expect(days.save).toHaveBeenCalledWith(TODAY, expect.objectContaining({ plan_energy: 4, planned_at: expect.any(String), top3: expect.arrayContaining([expect.any(String)]) }))
    const saved = (days.save as ReturnType<typeof vi.fn>).mock.calls[0]![1].top3 as string[]
    expect(saved).toHaveLength(3)
  })
  it('"Not today" dismisses the card', async () => {
    const days = fakeDaysApi()
    renderApp(<Today />, { tasks: tasks(), daysApi: days })
    await userEvent.click(screen.getByRole('button', { name: 'Not today' }))
    expect(days.save).toHaveBeenCalledWith(TODAY, { plan_dismissed_at: expect.any(String) })
  })
  it('once planned the card is gone and the Top 3 is pinned at the top, finished ones counted', () => {
    const ts = tasks()
    const row = dayRow(TODAY, { planned_at: '2026-11-10T12:30:00Z', top3: [ts[0]!.id, ts[4]!.id, ts[3]!.id] }) // open, done, dropped
    renderApp(<Today />, { tasks: ts, days: [row] })
    expect(screen.queryByRole('region', { name: 'Plan the day' })).toBeNull()
    const top = within(screen.getByRole('region', { name: 'Top 3' }))
    expect(top.getByRole('heading', { level: 2 }).textContent).toMatch(/1 of 2 done/)
    expect(top.getByText('Call Mom')).toBeInTheDocument()
    expect(top.queryByText('Already dropped')).toBeNull()
  })
})

describe('shutdown card on Today', () => {
  it('appears from the set time (Toronto) and not before', () => {
    at('2026-11-11T01:59:00Z') // 20:59 EST
    const { unmount } = renderApp(<Today />, { tasks: tasks(), days: [dayRow('2026-11-10', { planned_at: 'x' })] })
    expect(screen.queryByRole('link', { name: /Shut down the day.*About a minute/ })).toBeNull()
    unmount()
    vi.setSystemTime(new Date('2026-11-11T02:01:00Z')) // 21:01 EST
    renderApp(<Today />, { tasks: tasks(), days: [dayRow('2026-11-10', { planned_at: 'x' })] })
    expect(screen.getByRole('link', { name: /Shut down the day.*About a minute/ })).toBeInTheDocument()
  })
})

describe('evening shutdown', () => {
  beforeEach(() => at('2026-11-11T02:30:00Z')) // 21:30 Tue 10 Nov Toronto

  it('lists open tasks due or missed, never dropped or done ones', () => {
    renderApp(<Shutdown />, { tasks: tasks() })
    for (const t of ['Call Mom', 'Old missed', 'Renew passport']) expect(screen.getByText(t)).toBeInTheDocument()
    for (const t of ['Already dropped', 'Finished today']) expect(screen.queryByText(t)).toBeNull()
    expect(screen.getByRole('group', { name: 'Today in numbers' })).toHaveTextContent(/1 task done/)
  })
  it('one tap rolls every unfinished task to tomorrow and a deadline keeps its date', async () => {
    const api = fakeTasksApi(tasks())
    renderApp(<Shutdown />, { api })
    await userEvent.click(screen.getByRole('button', { name: 'Roll all to tomorrow' }))
    const calls = (api.update as ReturnType<typeof vi.fn>).mock.calls
    expect(calls).toHaveLength(2)
    expect(calls).toContainEqual([api.tasks[0]!.id, { start_on: '2026-11-11', due_on: '2026-11-11' }])
    expect(calls).toContainEqual([api.tasks[1]!.id, { start_on: '2026-11-11', due_on: '2026-11-11' }])
    expect(calls.map((c) => c[0])).not.toContain(api.tasks[2]!.id)
    expect(screen.getByText(/deadline stays/)).toBeInTheDocument()
  })
  it('Drop sets status dropped (never removes), No date clears, Pick a day moves; a deadline refuses No date', async () => {
    const api = fakeTasksApi(tasks())
    renderApp(<Shutdown />, { api })
    const row = (t: string) => within(screen.getByText(t).closest('li')!)
    await userEvent.click(row('Call Mom').getByRole('button', { name: 'Drop' }))
    expect(api.update).toHaveBeenLastCalledWith(api.tasks[0]!.id, { status: 'dropped' })
    expect(api.remove).not.toHaveBeenCalled()
    await userEvent.click(row('Old missed').getByRole('button', { name: 'No date' }))
    expect(api.update).toHaveBeenLastCalledWith(api.tasks[1]!.id, { start_on: null, due_on: null })
    await userEvent.click(row('Renew passport').getByRole('button', { name: 'No date' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/keeps its date/)
    await userEvent.click(row('Renew passport').getByRole('button', { name: 'Pick a day' }))
    await userEvent.type(screen.getByLabelText('Day for Renew passport'), '2026-11-09')
    await userEvent.click(screen.getByRole('button', { name: 'Move' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/later day/)
  })
  it('Finish saves mood, energy and the note and marks the day shut down', async () => {
    const days = fakeDaysApi()
    renderApp(<Shutdown />, { tasks: [], daysApi: days })
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Mood' })).getByRole('radio', { name: '4' }))
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Energy' })).getByRole('radio', { name: '2' }))
    await userEvent.type(screen.getByLabelText('Note about today'), 'solid')
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(days.save).toHaveBeenCalledWith(TODAY, expect.objectContaining({ mood: 4, energy: 2, review_note: 'solid', reviewed_at: expect.any(String) }))
  })
})
