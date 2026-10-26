import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeTimerApi, makeTask, polyfillDialog, renderApp } from '../test-utils'
import { newSession, pause } from '../lib/timer'
import { RunningBar } from './RunningBar'

beforeAll(polyfillDialog)
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] }); vi.setSystemTime(new Date('2026-11-10T15:00:00Z')) })
afterEach(() => vi.useRealTimers())

const at = (iso: string) => new Date(iso)
const running = (start = '2026-11-10T14:00:00Z') => newSession('s1', 'g1', { areaId: 'a-dsa', taskId: 't1', comment: 'ch 3' }, at(start))
const tasks = [makeTask({ id: 't1', title: 'Finish Week 3' })]

describe('running bar', () => {
  it('renders nothing without a timer', () => {
    const { container } = renderApp(<RunningBar />)
    expect(container.querySelector('section')).toBeNull()
  })
  it('shows task, tag and a live clock that keeps counting', () => {
    renderApp(<RunningBar />, { tasks, sessions: [running()] })
    expect(screen.getByRole('timer')).toHaveTextContent('1:00:00')
    expect(screen.getByText('Finish Week 3')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(65_000) })
    expect(screen.getByRole('timer')).toHaveTextContent('1:01:05')
  })
  it('Pause and Resume', () => {
    const a = renderApp(<RunningBar />, { tasks, sessions: [running()] })
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(a.timerApi.pause).toHaveBeenCalled()
    a.unmount()
    const b = renderApp(<RunningBar />, { tasks, sessions: [pause(running(), at('2026-11-10T14:20:00Z'))] })
    expect(screen.getByRole('timer')).toHaveTextContent('0:20:00')
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(b.timerApi.resume).toHaveBeenCalled()
  })
  it('Stop opens a comment box; "Stop now" sends the comment', () => {
    const { timerApi } = renderApp(<RunningBar />, { tasks, sessions: [running()] })
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    const box = within(screen.getByRole('group', { name: 'Stop the timer' }))
    expect(box.getByLabelText('Comment')).toHaveValue('ch 3')
    fireEvent.change(box.getByLabelText('Comment'), { target: { value: 'ch 3 and 4, on the phone' } })
    fireEvent.click(box.getByRole('button', { name: 'Stop now' }))
    expect(timerApi.stop).toHaveBeenCalledWith({ endedAt: undefined, comment: 'ch 3 and 4, on the phone' })
  })
  it('"Stop at that time" passes the typed end, and refuses one before the stretch began', () => {
    const { timerApi } = renderApp(<RunningBar />, { tasks, sessions: [running()] })
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    const box = within(screen.getByRole('group', { name: 'Stop the timer' }))
    fireEvent.change(box.getByLabelText('It ended at (Toronto time)'), { target: { value: '2026-11-10T08:00' } }) // before 9:00 start
    fireEvent.click(box.getByRole('button', { name: 'Stop at that time' }))
    expect(box.getByRole('alert')).toHaveTextContent(/before/)
    expect(timerApi.stop).not.toHaveBeenCalled()
    fireEvent.change(box.getByLabelText('It ended at (Toronto time)'), { target: { value: '2026-11-10T09:30' } })
    fireEvent.click(box.getByRole('button', { name: 'Stop at that time' }))
    expect(timerApi.stop).toHaveBeenCalledWith({ endedAt: at('2026-11-10T14:30:00Z'), comment: 'ch 3' })
  })
  it('asks "Still going?" after the set hours, and "Yes, keep going" quiets it for an hour', () => {
    renderApp(<RunningBar />, { tasks, sessions: [running('2026-11-10T10:30:00Z')] }) // 4.5 h ago, limit 4
    expect(screen.getByRole('alert')).toHaveTextContent(/Still going/)
    fireEvent.click(screen.getByRole('button', { name: 'Yes, keep going' }))
    expect(screen.queryByText(/Still going/)).toBeNull()
    act(() => { vi.advanceTimersByTime(61 * 60_000) })
    expect(screen.getByText(/Still going/)).toBeInTheDocument()
  })
  it('"It ended at…" from the prompt opens the stop box', () => {
    renderApp(<RunningBar />, { tasks, sessions: [running('2026-11-10T10:30:00Z')] })
    fireEvent.click(screen.getByRole('button', { name: 'It ended at…' }))
    expect(screen.getByRole('group', { name: 'Stop the timer' })).toBeInTheDocument()
  })
  it('does not ask for a short or paused session', () => {
    renderApp(<RunningBar />, { tasks, sessions: [running()] })
    expect(screen.queryByText(/Still going/)).toBeNull()
  })
  it('uses the setting for the limit', () => {
    renderApp(<RunningBar />, { tasks, sessions: [running('2026-11-10T13:00:00Z')], settingsApi: { stillGoingHours: 2 } }) // 2 h ago
    expect(screen.getByText(/Still going/)).toBeInTheDocument()
  })
  it('keeps the same fake api', () => {
    expect(fakeTimerApi([running()]).active?.id).toBe('s1')
  })
})
