import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CounterEvent } from '../lib/counters'
import { buildLog } from '../lib/activities'
import { newSession, stop } from '../lib/timer'
import { ACTIVITIES, fakeGoalsApi, fakeWeeksApi, makeDone, makeTask, renderApp } from '../test-utils'
import Insights from './Insights'

// Sunday 8 Nov 2026 10:00 Toronto: the review week (Mon 2 – Sun 8 Nov) is also the current Range week, so both screens show the same days.
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-08T15:00:00Z')) })
afterEach(() => vi.useRealTimers())

const tasks = [
  makeDone('2026-11-04', '2026-11-04T15:00:00Z', { title: 'on time' }),
  makeDone('2026-11-03', '2026-11-06T15:00:00Z', { title: 'done late' }), // still missed
  makeTask({ title: 'open missed', due_on: '2026-11-05' }),
  makeTask({ title: 'deadline missed', due_on: '2026-11-06', hard_deadline: true }),
  makeDone('2026-11-02', '2026-11-04T16:00:00Z', { title: 'deadline done late', hard_deadline: true }),
  makeTask({ title: 'dropped', due_on: '2026-11-04', status: 'dropped' }),
  makeTask({ title: 'Tax return', due_on: '2026-11-18', hard_deadline: true }),
]
const ev = (id: string, day: string, qty = 1): CounterEvent => ({ id, counter_id: 'c-cig', at: `${day}T15:00:00Z`, day, qty, note: null, reason: null })
const events = [ev('e1', '2026-11-03', 3), ev('e2', '2026-11-04'), ev('e3', '2026-10-30', 5)]
const run = stop(newSession('s1', 'g1', { areaId: 'a-dsa' }, new Date('2026-11-03T15:00:00Z')), new Date('2026-11-03T16:00:00Z'))
const gym = buildLog(ACTIVITIES[1]!, 45, '2026-11-05T15:45:00Z', 'l1')

const num = (name: RegExp) => Number(screen.getByLabelText(name).textContent)

describe('Insights → Review', () => {
  it('shows the same task numbers as Insights → Range for the same week', () => {
    const { unmount } = renderApp(<Insights />, { tasks, events, route: '/insights?tab=review' })
    const review = { done: num(/^Done: /), missed: num(/^Missed: /), deadlines: num(/^Deadlines missed: /) }
    expect(review).toEqual({ done: 3, missed: 2, deadlines: 2 }) // done late counts as missed; a deadline done late counts as a missed deadline
    unmount()
    renderApp(<Insights />, { tasks, events, route: '/insights?tab=range&range=week' })
    expect({ done: num(/^Tasks done: /), missed: num(/^Tasks missed: /), deadlines: num(/^Deadlines missed: /) }).toEqual(review)
  })
  it('shows counters and activities against last week, deadlines ahead, and hours by tag against the week before', () => {
    renderApp(<Insights />, { tasks, events, logs: [gym], activities: ACTIVITIES, sessions: [run], route: '/insights?tab=review' })
    expect(within(screen.getByRole('region', { name: 'Counters' })).getByText('Cig')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Counters' })).getByText('4')).toBeInTheDocument() // 3 + 1; the 5 on 30 Oct is the week before
    expect(within(screen.getByRole('region', { name: 'Activities' })).getByText('Gym').closest('li')).toHaveTextContent('1 / 3')
    expect(within(screen.getByRole('region', { name: 'Deadlines ahead' })).getByText('Tax return')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Hours by tag' })).getByText('Study').closest('li')).toHaveTextContent('1h 00m')
  })
  it('steps to the week before, and browses past reviews', async () => {
    renderApp(<Insights />, { tasks, events, weeks: [{ week_start: '2026-10-26', note: 'slow week', reviewed_at: '2026-11-01T20:00:00Z' }], route: '/insights?tab=review' })
    expect(screen.getByRole('button', { name: 'Next week' })).toBeDisabled()
    await userEvent.click(within(screen.getByRole('region', { name: 'Past reviews' })).getByRole('button', { name: /slow week/ }))
    expect(screen.getByText(/^Reviewed · against/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next week' })).toBeEnabled()
    expect(screen.getByRole('textbox', { name: 'Review note' })).toHaveValue('slow week')
  })
  it('saves the note with the week start, and sets next week\'s goals from today', async () => {
    const weeksApi = fakeWeeksApi()
    const goal = { id: 'g1', series_id: 'g1', name: '', metric: 'activity_count' as const, target_id: 'act-gym', direction: 'at_least' as const, amount: 3, period: 'week' as const, starts_on: '2026-10-01', ends_on: null, paused: false, sort: 0 }
    const goalsApi = fakeGoalsApi([goal])
    renderApp(<Insights />, { tasks, events, activities: ACTIVITIES, goalsApi, weeksApi, route: '/insights?tab=review' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Review note' }), { target: { value: 'good' } })
    await userEvent.click(screen.getByRole('button', { name: 'Finish review' }))
    expect(weeksApi.save).toHaveBeenCalledWith('2026-11-02', { note: 'good', reviewed_at: expect.any(String) })
    const goals = within(screen.getByRole('region', { name: "Next week's goals" }))
    const amount = goals.getByLabelText('New amount')
    await userEvent.clear(amount)
    await userEvent.type(amount, '4')
    await userEvent.click(goals.getByRole('button', { name: 'Set' }))
    expect(goalsApi.edit).toHaveBeenCalledWith('g1', { name: '', metric: 'activity_count', target_id: 'act-gym', direction: 'at_least', amount: 4, period: 'week' })
  })
})
