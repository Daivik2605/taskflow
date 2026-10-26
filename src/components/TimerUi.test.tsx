import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes, useLocation } from 'react-router-dom'
import { ACTIVITIES, fakeTimerApi, makeTask, polyfillDialog, renderApp } from '../test-utils'
import { newSession, pastSession, stop } from '../lib/timer'
import { ActivityButtons } from './ActivityButtons'
import { OverviewStrip } from './OverviewStrip'
import { TaskRow } from './TaskRow'

beforeAll(polyfillDialog)
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-10T15:00:00Z')) })
afterEach(() => { vi.useRealTimers(); localStorage.clear() })

const at = (iso: string) => new Date(iso)

describe('play button on a task row', () => {
  it('starts a timer on the task with its tag', () => {
    const t = makeTask({ id: 't1', title: 'Finish Week 3', area_id: 'a-dsa' })
    const { timerApi } = renderApp(<ul><TaskRow task={t} today="2026-11-10" /></ul>, { tasks: [t] })
    fireEvent.click(screen.getByRole('button', { name: 'Start timer: Finish Week 3' }))
    expect(timerApi.requestStart).toHaveBeenCalledWith({ areaId: 'a-dsa', taskId: 't1' })
  })
  it('a task with no tag opens the Timer with the task preselected', () => {
    const t = makeTask({ id: 't2', title: 'No tag task' })
    function Where() { const l = useLocation(); return <p data-testid="loc">{l.pathname + l.search}</p> }
    const { timerApi } = renderApp(<><Routes><Route path="*" element={<ul><TaskRow task={t} today="2026-11-10" /></ul>} /></Routes><Where /></>, { tasks: [t] })
    fireEvent.click(screen.getByRole('button', { name: 'Start timer: No tag task' }))
    expect(timerApi.requestStart).not.toHaveBeenCalled()
    expect(screen.getByTestId('loc')).toHaveTextContent('/timer?task=t2')
  })
  it('shows logged time and estimate vs actual, amber when over', () => {
    const t = makeTask({ id: 't1', title: 'Finish Week 3', area_id: 'a-dsa', estimate_minutes: 60 })
    const api = fakeTimerApi([], { taskMinutes: new Map([['t1', 90]]) })
    renderApp(<ul><TaskRow task={t} today="2026-11-10" /></ul>, { tasks: [t], timerApi: api })
    expect(screen.getByText('1h 30m logged of 1h 00m')).toHaveClass('text-amber-600')
  })
  it('is disabled for the task already being timed, and absent on a done task', () => {
    const t = makeTask({ id: 't1', title: 'Finish Week 3', area_id: 'a-dsa' })
    const running = newSession('s', 'g', { areaId: 'a-dsa', taskId: 't1' }, new Date())
    const { unmount } = renderApp(<ul><TaskRow task={t} today="2026-11-10" /></ul>, { tasks: [t], sessions: [running] })
    expect(screen.getByRole('button', { name: 'Timer running on: Finish Week 3' })).toBeDisabled()
    unmount()
    renderApp(<ul><TaskRow task={{ ...t, status: 'done' }} today="2026-11-10" /></ul>, { tasks: [t] })
    expect(screen.queryByRole('button', { name: /Start timer/ })).toBeNull()
  })
})

describe('overview Time card', () => {
  const sessions = [
    stop(newSession('a', 'ag', { areaId: 'a-dsa' }, at('2026-11-10T13:00:00Z')), at('2026-11-10T14:30:00Z')), // 1h 30 study
    pastSession('b', 'bg', { areaId: 'a-work', start: at('2026-11-10T11:00:00Z'), end: at('2026-11-10T12:00:00Z') }), // 1h work
  ]
  it('shows study, hustle and work for the period and opens Insights → Range', () => {
    renderApp(<OverviewStrip />, { sessions })
    const card = screen.getByRole('link', { name: /^Time today: 2h 30m/ })
    expect(card).toHaveTextContent('study 1h 30m · hustle 0m · work 1h 00m')
    expect(card).toHaveAttribute('href', '/insights?tab=range&range=day')
  })
  it('counts a running timer up to now', () => {
    renderApp(<OverviewStrip />, { sessions: [newSession('r', 'rg', { areaId: 'a-dsa' }, at('2026-11-10T14:00:00Z'))] }) // started 1h ago
    expect(screen.getByRole('link', { name: /^Time today: 1h 00m/ })).toBeInTheDocument()
  })
})

describe('activity sheet, start timer instead', () => {
  it("starts a timer on the activity's tag", () => {
    const { timerApi } = renderApp(<ActivityButtons />, { activities: ACTIVITIES })
    fireEvent.click(screen.getByRole('button', { name: /More for Kriya/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Kriya logs' })).getByRole('button', { name: 'Start timer instead' }))
    expect(timerApi.requestStart).toHaveBeenCalledWith({ areaId: 'a-study', comment: 'Kriya' })
  })
})
