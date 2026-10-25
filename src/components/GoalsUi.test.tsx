import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CounterEvent } from '../lib/counters'
import type { Goal } from '../lib/goals'
import { GoalsSettings } from '../screens/settings/GoalsSettings'
import Insights from '../screens/Insights'
import { ACTIVITIES, fakeGoalsApi, polyfillDialog, renderApp } from '../test-utils'
import { CounterPills } from './CounterPills'
import { OverviewStrip } from './OverviewStrip'

beforeAll(polyfillDialog)
// Tue 10 Nov 2026, 10:00 Toronto
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] }); vi.setSystemTime(new Date('2026-11-10T15:00:00Z')) })
afterEach(() => { vi.useRealTimers(); localStorage.clear() })

const goal = (over: Partial<Goal>): Goal => ({
  id: 'g1', series_id: 's1', name: '', metric: 'counter_count', target_id: 'c-cig', direction: 'at_most', amount: 5, period: 'day',
  starts_on: '2026-10-01', ends_on: null, paused: false, sort: 0, ...over,
})
const taps = (n: number, counter = 'c-cig'): CounterEvent[] =>
  Array.from({ length: n }, (_, i) => ({ id: `t${counter}${i}`, counter_id: counter, at: `2026-11-10T1${i % 5}:00:00.000Z`, day: '2026-11-10', qty: 1, note: null, reason: null }))

describe('counter pills against a limit', () => {
  const pill = (name: RegExp) => screen.getByRole('button', { name }).closest('[data-limit]') as HTMLElement
  it('stay plain below the limit and show count / limit', () => {
    renderApp(<CounterPills />, { goals: [goal({})], events: taps(3) })
    expect(pill(/^Cigarette/)).toHaveAttribute('data-limit', 'ok')
    expect(pill(/^Cigarette/)).toHaveTextContent(/^Cig\s*3\/5/)
    expect(pill(/^Weed/)).toHaveAttribute('data-limit', 'none')
  })
  it('turn amber at the limit and red over it', () => {
    const { unmount } = renderApp(<CounterPills />, { goals: [goal({})], events: taps(5) })
    expect(pill(/^Cigarette/)).toHaveAttribute('data-limit', 'at')
    expect(pill(/^Cigarette/).className).toMatch(/amber/)
    expect(screen.getByRole('button', { name: /^Cigarette/ })).toHaveAccessibleName(/at the limit/)
    unmount()
    renderApp(<CounterPills />, { goals: [goal({})], events: taps(6) })
    expect(pill(/^Cigarette/)).toHaveAttribute('data-limit', 'over')
    expect(pill(/^Cigarette/).className).toMatch(/red/)
    expect(pill(/^Cigarette/)).toHaveTextContent(/^Cig\s*6\/5/)
    expect(screen.getByRole('button', { name: /^Cigarette/ })).toHaveAccessibleName(/over the limit/)
  })
  it('a paused goal has no effect', () => {
    renderApp(<CounterPills />, { goals: [goal({ paused: true })], events: taps(9) })
    expect(pill(/^Cigarette/)).toHaveAttribute('data-limit', 'none')
  })
})

describe('reason chips after a tap', () => {
  it('offer the counter’s reasons for a few seconds; picking one saves it and keeps Undo', () => {
    const { countersApi } = renderApp(<CounterPills />)
    fireEvent.click(screen.getByRole('button', { name: /^Cigarette/ }))
    const id = (countersApi.tap as ReturnType<typeof vi.fn>).mock.calls[0][1].id
    const chips = within(screen.getByRole('group', { name: /Reason for Cigarette/ }))
    expect(chips.getAllByRole('button').map((b) => b.textContent)).toEqual(['bored', 'stress'])
    fireEvent.click(chips.getByRole('button', { name: 'stress' }))
    expect(countersApi.setReason).toHaveBeenCalledWith(id, 'stress')
    expect(screen.getByRole('status')).toHaveTextContent('Cig +1 · stress')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(countersApi.removeEvent).toHaveBeenCalledWith(id)
  })
  it('are never required: ignoring them records the tap as it is, and the row goes away', () => {
    const { countersApi } = renderApp(<CounterPills />)
    fireEvent.click(screen.getByRole('button', { name: /^Cigarette/ }))
    expect(countersApi.tap).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(9000) })
    expect(screen.queryByRole('group', { name: /Reason for/ })).toBeNull()
    expect(countersApi.setReason).not.toHaveBeenCalled()
  })
  it('a counter with no reasons shows no chips', () => {
    renderApp(<CounterPills />)
    fireEvent.click(screen.getByRole('button', { name: /^Weed/ }))
    expect(screen.queryByRole('group', { name: /Reason for/ })).toBeNull()
  })
})

describe('counter sheet gaps', () => {
  it('shows the longest gap today and the best gap this week', () => {
    // 09:00 and 10:00 Toronto taps (14:00Z, 15:00Z) at "now" 10:00 → 60 min between them
    const events = ['2026-11-10T14:00:00.000Z', '2026-11-10T15:00:00.000Z'].map((at, i): CounterEvent => ({ id: `g${i}`, counter_id: 'c-cig', at, day: '2026-11-10', qty: 1, note: null, reason: null }))
    renderApp(<CounterPills />, { events })
    fireEvent.click(screen.getByRole('button', { name: /More for Cigarette/ }))
    expect(within(screen.getByRole('dialog', { name: 'Cigarette taps' })).getByText(/Longest gap today: 1h 00m · Best gap this week: 1h 00m/)).toBeInTheDocument()
  })
})

describe('overview Goals row', () => {
  it('shows each goal’s progress with a word as well as a bar', () => {
    renderApp(<OverviewStrip />, { goals: [goal({}), goal({ id: 'g2', series_id: 's2', metric: 'activity_count', target_id: 'act-gym', direction: 'at_least', amount: 3, period: 'week' })], events: taps(6), activities: ACTIVITIES })
    const row = within(screen.getByRole('group', { name: 'Goals' }))
    expect(row.getByRole('group', { name: 'Cigarette ≤ 5 / day: 6 / 5, Over limit' })).toBeInTheDocument()
    expect(row.getByRole('group', { name: 'Gym ≥ 3× / week: 0 / 3, In progress' })).toBeInTheDocument()
  })
  it('points to Settings when there are no goals', () => {
    renderApp(<OverviewStrip />)
    expect(within(screen.getByRole('group', { name: 'Goals' })).getByText(/No goals yet/)).toBeInTheDocument()
  })
})

describe('Settings → Goals', () => {
  const lists = { activities: ACTIVITIES }
  it('adds a counter limit: "Cigarette at most 5 per day"', async () => {
    vi.useRealTimers()
    const { goalsApi } = renderApp(<GoalsSettings />, { ...lists })
    await userEvent.click(screen.getByRole('button', { name: 'Add a goal' }))
    const form = within(screen.getByRole('group', { name: 'New goal' }))
    await userEvent.selectOptions(form.getByLabelText('Counter'), 'c-cig')
    expect(form.getByLabelText('Goal')).toHaveValue('at_most') // counters default to a limit
    await userEvent.type(form.getByLabelText('Amount'), '5')
    await userEvent.click(form.getByRole('button', { name: 'Add goal' }))
    expect(goalsApi.add).toHaveBeenCalledWith({ name: '', metric: 'counter_count', target_id: 'c-cig', direction: 'at_most', amount: 5, period: 'day' })
  })
  it('a tag goal is typed in hours and stored as minutes', async () => {
    vi.useRealTimers()
    const { goalsApi } = renderApp(<GoalsSettings />, { route: '/settings?goal=tag_minutes:a-study' })
    const form = within(await screen.findByRole('group', { name: 'New goal' }))
    expect(form.getByLabelText('Hours')).toBeInTheDocument()
    await userEvent.type(form.getByLabelText('Amount'), '15')
    await userEvent.click(form.getByRole('button', { name: 'Add goal' }))
    expect(goalsApi.add).toHaveBeenCalledWith(expect.objectContaining({ metric: 'tag_minutes', target_id: 'a-study', direction: 'at_least', amount: 900, period: 'week' }))
  })
  it('"Set a goal" links open the form with the target chosen', async () => {
    vi.useRealTimers()
    renderApp(<GoalsSettings />, { route: '/settings?goal=activity_count:act-gym', ...lists })
    const form = within(await screen.findByRole('group', { name: 'New goal' }))
    expect(form.getByLabelText('Activity')).toHaveValue('act-gym')
    expect(form.getByLabelText('Per')).toHaveValue('week')
  })
  it('shows a refusal from the data layer', async () => {
    vi.useRealTimers()
    renderApp(<GoalsSettings />, { goalsApi: fakeGoalsApi([], { add: vi.fn(async () => 'You already have that goal. Edit it instead.') }) })
    await userEvent.click(screen.getByRole('button', { name: 'Add a goal' }))
    const form = within(screen.getByRole('group', { name: 'New goal' }))
    await userEvent.selectOptions(form.getByLabelText('Counter'), 'c-cig')
    await userEvent.type(form.getByLabelText('Amount'), '5')
    await userEvent.click(form.getByRole('button', { name: 'Add goal' }))
    expect(form.getByRole('alert')).toHaveTextContent('already have that goal')
  })
  it('edits (sends the goal id and new target), pauses and deletes with a warning about history', async () => {
    vi.useRealTimers()
    const { goalsApi } = renderApp(<GoalsSettings />, { goals: [goal({})] })
    await userEvent.click(screen.getByRole('button', { name: 'Edit Cigarette ≤ 5 / day' }))
    const form = within(screen.getByRole('group', { name: 'Edit goal' }))
    expect(form.getByText(/past days judged on the old one/)).toBeInTheDocument()
    await userEvent.clear(form.getByLabelText('Amount'))
    await userEvent.type(form.getByLabelText('Amount'), '4')
    await userEvent.click(form.getByRole('button', { name: 'Save' }))
    expect(goalsApi.edit).toHaveBeenCalledWith('g1', { name: '', metric: 'counter_count', target_id: 'c-cig', direction: 'at_most', amount: 4, period: 'day' })
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(goalsApi.setPaused).toHaveBeenCalledWith('g1', true)
    await userEvent.click(screen.getByRole('button', { name: 'Delete Cigarette ≤ 5 / day' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/whole history/)
    await userEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Delete' }))
    expect(goalsApi.remove).toHaveBeenCalledWith('s1')
  })
})

describe('Insights', () => {
  it('Goals tab: hit rate and streak per goal', () => {
    // a daily limit of 2 since Nov 1; over on Nov 3 only → Nov 1–9: 8 of 9 hit, streak 6 (Nov 4–9)
    const events: CounterEvent[] = [3, 3, 3].map((_, i) => ({ id: `x${i}`, counter_id: 'c-cig', at: '2026-11-03T15:00:00.000Z', day: '2026-11-03', qty: 1, note: null, reason: null }))
    renderApp(<Insights />, { route: '/insights?tab=goals', goals: [goal({ amount: 2, starts_on: '2026-11-01' })], events })
    const sec = within(screen.getByRole('region', { name: 'Cigarette ≤ 2 / day' }))
    expect(sec.getByLabelText('Hit rate: 89 percent')).toBeInTheDocument()
    expect(sec.getByText('8 of 9')).toBeInTheDocument()
    expect(sec.getAllByText('6')).toHaveLength(2) // streak and best streak
  })
  it('Counters tab: reasons by count and by hour of day', () => {
    const e = (id: string, at: string, day: string, reason: string | null): CounterEvent => ({ id, counter_id: 'c-cig', at, day, qty: 1, note: null, reason })
    const events = [e('a', '2026-11-10T14:00:00.000Z', '2026-11-10', 'bored'), e('b', '2026-11-09T14:00:00.000Z', '2026-11-09', 'bored'), e('c', '2026-11-09T20:00:00.000Z', '2026-11-09', 'stress'), e('d', '2026-11-09T21:00:00.000Z', '2026-11-09', null)]
    renderApp(<Insights />, { route: '/insights?tab=counters&counter=c-cig', events })
    const list = within(screen.getByRole('list', { name: 'Taps by reason' }))
    expect(list.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['bored2', 'stress1', '1 with no reason picked'])
    fireEvent.click(list.getByRole('button', { name: /bored/ }))
    expect(screen.getByRole('img', { name: /By hour of day · bored/ })).toBeInTheDocument()
  })
  it('Counters tab says how reasons get picked when there are none yet', () => {
    renderApp(<Insights />, { route: '/insights?tab=counters&counter=c-cig' })
    expect(screen.getByText(/No reasons picked yet/)).toBeInTheDocument()
  })
})
