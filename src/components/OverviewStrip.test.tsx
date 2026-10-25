import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CounterButtons } from './CounterButtons'
import { CountersContext } from '../data/counters'
import { COUNTERS, fakeCountersApi, fakeTasksApi, makeDone, makeTask, renderApp } from '../test-utils'
import type { CounterEvent } from '../lib/counters'
import { OverviewStrip } from './OverviewStrip'

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T15:00:00Z')) }) // Tue 10 Nov, Toronto
afterEach(() => { vi.useRealTimers(); localStorage.clear() })

const tasks = () => [
  makeTask({ title: 'Pass G2', due_on: '2026-11-09' }), // missed (Mon)
  makeTask({ title: 'Renew passport', due_on: '2026-11-08', hard_deadline: true }), // deadline missed (last week)
  makeTask({ title: 'Call Mom', start_on: '2026-11-10', due_on: '2026-11-10' }),
  makeTask({ title: 'Tax return', due_on: '2026-11-20', hard_deadline: true }),
  makeTask({ title: 'Starts later', start_on: '2026-11-12', due_on: '2026-11-12' }),
  makeTask({ title: 'Someday' }),
  makeDone('2026-11-10', '2026-11-10T14:00:00Z'),
]
const card = (name: RegExp) => screen.getByRole('link', { name })

describe('OverviewStrip', () => {
  it('shows today by default, with the right numbers', () => {
    renderApp(<OverviewStrip />, { tasks: tasks() })
    expect(card(/^To do today: 2/)).toBeInTheDocument() // Call Mom + Someday
    expect(card(/^Due today, now: 1/)).toBeInTheDocument()
    expect(card(/^Upcoming, now: 1/)).toBeInTheDocument()
    expect(card(/^Deadlines.*now: 1. Nearest: Tax return in 10 days/)).toBeInTheDocument()
    expect(card(/^Missed today: 0 tasks, 0 deadlines/)).toBeInTheDocument()
    expect(card(/^Completed today: 1/)).toBeInTheDocument()
  })
  it('the toggle changes the period cards but not the "now" snapshots, and is remembered', async () => {
    const { unmount } = renderApp(<OverviewStrip />, { tasks: tasks() })
    await userEvent.click(screen.getByRole('radio', { name: 'Month' }))
    expect(card(/^Missed month: 1 tasks, 1 deadlines/)).toBeInTheDocument() // Pass G2; Renew passport (today showed 0 / 0)
    expect(card(/^Due today, now: 1/)).toBeInTheDocument()
    unmount()
    renderApp(<OverviewStrip />, { tasks: tasks() })
    expect(screen.getByRole('radio', { name: 'Month' })).toBeChecked()
  })
  it('labels the snapshot cards "now" and only those', () => {
    renderApp(<OverviewStrip />, { tasks: tasks() })
    const labelled = screen.getAllByRole('link').filter((l) => within(l).queryByText('now'))
    expect(labelled.map((l) => l.getAttribute('aria-label')?.split(',')[0])).toEqual(['Due today', 'Upcoming', 'Deadlines in the next 14 days'])
  })
  it('every card opens the right view', async () => {
    renderApp(<OverviewStrip />, { tasks: tasks() })
    const href = (n: RegExp) => card(n).getAttribute('href')
    expect(href(/^To do/)).toBe('/tasks')
    expect(href(/^Due today/)).toBe('/tasks?view=today')
    expect(href(/^Upcoming/)).toBe('/tasks?view=upcoming')
    expect(href(/^Deadlines/)).toBe('/tasks?view=deadlines')
    expect(href(/^Missed/)).toBe('/insights?tab=range&range=day')
    expect(href(/^Completed/)).toBe('/insights?tab=range&range=day')
    expect(href(/^Cigarette/)).toBe('/insights?tab=counters&counter=c-cig')
    expect(href(/^Weed/)).toBe('/insights?tab=counters&counter=c-weed')
    await userEvent.click(screen.getByRole('radio', { name: 'Week' }))
    expect(href(/^Completed/)).toBe('/insights?tab=range&range=week')
  })
  it('shows skeletons while loading', () => {
    renderApp(<OverviewStrip />, { api: fakeTasksApi([], { loading: true }), countersApi: fakeCountersApi(COUNTERS, [], { loading: true }) })
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(document.querySelectorAll('.animate-pulse')).toHaveLength(8)
  })
  it('tapping a counter updates its card at once, with the change vs yesterday', async () => {
    const ev = (day: string): CounterEvent => ({ id: `e-${day}-${Math.random()}`, counter_id: 'c-cig', at: `${day}T15:00:00.000Z`, day, qty: 1, note: null })
    function Harness() {
      const [events, setEvents] = useState<CounterEvent[]>([ev('2026-11-09'), ev('2026-11-09')])
      const api = fakeCountersApi(COUNTERS, events, {
        tap: vi.fn(async (_id: string, o?: { id?: string }) => { const e = { ...ev('2026-11-10'), id: o?.id ?? 'x' }; setEvents((p) => [...p, e]); return e }),
      })
      return <CountersContext.Provider value={api}><OverviewStrip /><CounterButtons /></CountersContext.Provider>
    }
    renderApp(<Harness />, { tasks: [] })
    expect(card(/^Cigarette today: 0, down 2/)).toBeInTheDocument()
    await act(async () => { screen.getByRole('button', { name: /^Cigarette: 0 today/ }).click() })
    expect(card(/^Cigarette today: 1, down 1/)).toBeInTheDocument()
  })
})
