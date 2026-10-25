import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CounterEvent } from '../lib/counters'
import { makeDone, makeTask, renderApp } from '../test-utils'
import Insights from './Insights'

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T15:00:00Z')) }) // Tue 10 Nov 10:00 Toronto
afterEach(() => vi.useRealTimers())

const ev = (id: string, counter: string, at: string, day: string, qty = 1): CounterEvent => ({ id, counter_id: counter, at, day, qty, note: null })
const events = [
  ev('e1', 'c-cig', '2026-11-10T13:00:00Z', '2026-11-10'), ev('e2', 'c-cig', '2026-11-10T14:30:00Z', '2026-11-10', 2),
  ev('e3', 'c-cig', '2026-11-09T20:00:00Z', '2026-11-09'), ev('e4', 'c-cig', '2026-11-02T20:00:00Z', '2026-11-02'),
  ev('e5', 'c-weed', '2026-11-10T16:00:00Z', '2026-11-10'),
]
const tasks = [
  makeDone('2026-11-09', '2026-11-10T14:00:00Z', { title: 'Pass G2', area_id: 'a-personal' }), // done late today
  makeDone(null, '2026-11-09T20:00:00Z', { title: 'Yesterday task' }),
  makeTask({ title: 'Missed task', due_on: '2026-11-08' }),
  makeTask({ title: 'Missed deadline', due_on: '2026-11-07', hard_deadline: true }),
  makeTask({ title: 'Still open', due_on: '2026-11-20' }),
]
const show = (route = '/insights') => renderApp(<Insights />, { tasks, events, route })

describe('Insights → Day', () => {
  it('logs what was finished and every counter tap, in time order, in Toronto time', () => {
    show()
    const log = within(screen.getByRole('list', { name: 'Log' }))
    const lines = log.getAllByRole('listitem').map((li) => li.textContent?.replace(/\s+/g, ''))
    expect(lines).toEqual([
      '8:00am🚬Cigarette', // 13:00Z
      '9:00am✓PassG2Late🏠Personal', // 14:00Z — finished a day after its due date, so it says Late
      '9:30am🚬Cigarette×2', // 14:30Z
      '11:00am🌿Weed', // 16:00Z
    ])
  })
  it('summarises tasks done and counter totals for the day', () => {
    show()
    expect(screen.getByText(/1 task done · 🚬 3 · 🌿 1/)).toBeInTheDocument()
  })
  it('steps back a day, and cannot go past today', () => {
    show()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByText('Mon 9 Nov')).toBeInTheDocument()
    expect(screen.getByText(/1 task done · 🚬 1/)).toBeInTheDocument()
    expect(screen.getByText('Yesterday task')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })
  it('says so for an empty day', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByText('Nothing logged for this day.')).toBeInTheDocument()
  })
})

describe('Insights → Range', () => {
  const range = () => { show(); fireEvent.click(screen.getByRole('tab', { name: 'Range' })) }

  it('this week: tasks done, tasks missed and deadlines missed are separate numbers', () => {
    range()
    const totals = within(screen.getByRole('group', { name: 'Task totals' }))
    expect(totals.getByLabelText('Tasks done: 2')).toBeInTheDocument()
    expect(totals.getByLabelText('Tasks missed: 1')).toBeInTheDocument() // Pass G2 was finished late (due Mon 9 Nov); "Missed task" was due 8 Nov (last week)
    expect(totals.getByLabelText('Deadlines missed: 0')).toBeInTheDocument()
  })
  it('lists the tasks behind each number', () => {
    range()
    expect(within(screen.getByText(/^Tasks done · \d/).closest('details')!).getByText('Pass G2')).toBeInTheDocument()
    expect(within(screen.getByText(/^Tasks missed · \d/).closest('details')!).getByText('Pass G2')).toBeInTheDocument()
  })
  it('last week shows the tasks and deadlines that were missed then', () => {
    range()
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    const totals = within(screen.getByRole('group', { name: 'Task totals' }))
    expect(totals.getByLabelText('Tasks missed: 1')).toBeInTheDocument() // Missed task (8 Nov)
    expect(totals.getByLabelText('Deadlines missed: 1')).toBeInTheDocument() // Missed deadline (7 Nov)
    expect(within(screen.getByText(/^Deadlines missed · \d/).closest('details')!).getByText('Missed deadline')).toBeInTheDocument()
  })
  it('totals each counter over the range with a per-day average', () => {
    range()
    const c = screen.getByRole('heading', { name: 'Counters' }).closest('div')!
    expect(within(c).getByText(/Cigarette/).closest('li')).toHaveTextContent('4 · 0.6/day') // 3 today + 1 yesterday = 4 over 7 days
    expect(within(c).getByText(/Weed/).closest('li')).toHaveTextContent('1 · 0.1/day')
  })
  it('a custom range uses the two dates', () => {
    range()
    fireEvent.click(screen.getByRole('radio', { name: 'Custom' }))
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-10' } })
    expect(screen.getByText(/Sun 1 Nov – Tue 10 Nov · 10 days/)).toBeInTheDocument()
    expect(within(screen.getByRole('heading', { name: 'Counters' }).closest('div')!).getByText(/Cigarette/).closest('li')).toHaveTextContent('5 ·') // 3 + 1 + 1 (2 Nov)
  })
  it('a month range', () => {
    range()
    fireEvent.click(screen.getByRole('radio', { name: 'Month' }))
    expect(screen.getByText(/Nov 2026 · 30 days/)).toBeInTheDocument()
  })
})

describe('Insights → Counters', () => {

  it('shows the Cigarette stats from SPEC §13', () => {
    show('/insights?tab=counters')
    const dl = screen.getByLabelText('Cigarette stats')
    const get = (k: string) => within(dl).getByLabelText(new RegExp(`^${k}:`)).textContent
    expect(get('Today')).toBe('3')
    expect(get('This week')).toBe('4')
    expect(get('This month')).toBe('5')
    expect(get('All time')).toBe('5')
    expect(get('7-day average')).toBe('0.6/day') // Nov 4–10: 4 / 7
    expect(get('30-day average')).toBe('0.2/day') // 5 / 30
    expect(get('Days since last')).toBe('0')
    expect(get('Zero days this month')).toBe('7') // Nov 1–9 minus the taps on 2 and 9 Nov
  })
  it('switches to the other counter (and the link from a counter opens the right one)', () => {
    show('/insights?tab=counters&counter=c-weed')
    expect(screen.getByRole('tab', { name: /Weed/ })).toHaveAttribute('aria-selected', 'true')
    expect(within(screen.getByLabelText('Weed stats')).getByLabelText(/^All time:/)).toHaveTextContent('1')
  })
  it('has the three charts', () => {
    show('/insights?tab=counters')
    expect(screen.getByRole('img', { name: /^Per day · last 30 days/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Per week · last 12 weeks/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Per month · last 12 months/ })).toBeInTheDocument()
  })
  it('the chart description carries the numbers (so it is readable without seeing it)', () => {
    show('/insights?tab=counters')
    expect(screen.getByRole('img', { name: /^Per day · last 30 days.*Tue 10 Nov 3/ })).toBeInTheDocument()
  })
})
