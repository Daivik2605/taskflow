import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildLog, type Activity, type ActivityLog } from '../lib/activities'
import { polyfillDialog, renderApp } from '../test-utils'
import { ActivityButtons } from './ActivityButtons'

beforeAll(polyfillDialog)
// Tue 10 Nov 2026, 10:00 Toronto (EST) = 15:00Z; the week starts Monday
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] }); vi.setSystemTime(new Date('2026-11-10T15:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

const act_ = (over: Partial<Activity> & { id: string; name: string }): Activity => ({ area_id: 'a-work', default_minutes: 30, weekly_target: null, sort: 0, archived: false, ...over })
const activities = [
  act_({ id: 'kriya', name: 'Kriya', default_minutes: 35, sort: 0 }),
  act_({ id: 'gym', name: 'Gym', default_minutes: 60, weekly_target: 3, sort: 1 }),
  act_({ id: 'hidden', name: 'Hidden', sort: 2, archived: true }),
]
const log = (id: string, ended: string, minutes = 60, preset = 'gym'): ActivityLog => buildLog({ id: preset, area_id: 'a-work' }, minutes, ended, id)
const logs = [log('g1', '2026-11-10T13:00:00Z'), log('g2', '2026-11-09T23:00:00Z'), log('g3', '2026-11-08T23:00:00Z')] // today, Monday, last Sunday
const btn = (name: RegExp) => screen.getByRole('button', { name })

describe('activity buttons', () => {
  it('show done today and N/target this week', () => {
    renderApp(<ActivityButtons />, { activities, logs })
    expect(btn(/^Gym: done today, 2\/3 this week/)).toHaveTextContent('2/3 this week')
    expect(btn(/^Kriya: not done today, 0 this week/)).toHaveTextContent('0 this week') // no target: "N this week"
  })
  it('skip hidden activities, and render nothing when there are none', () => {
    const { unmount } = renderApp(<ActivityButtons />, { activities, logs })
    expect(screen.queryByRole('button', { name: /^Hidden/ })).toBeNull()
    unmount()
    const { container } = renderApp(<ActivityButtons />, { activities: [], logs })
    expect(container.querySelector('[role="group"]')).toBeNull()
  })
  it('one tap logs the default minutes now, and offers Undo', () => {
    const { activitiesApi } = renderApp(<ActivityButtons />, { activities, logs })
    fireEvent.click(btn(/^Gym/))
    expect(activitiesApi.log).toHaveBeenCalledTimes(1)
    expect(activitiesApi.log).toHaveBeenCalledWith('gym', { id: expect.any(String) })
    expect(screen.getByRole('status')).toHaveTextContent('Gym logged · 60 min')
  })
  it('Undo removes that exact log', () => {
    const { activitiesApi } = renderApp(<ActivityButtons />, { activities, logs })
    fireEvent.click(btn(/^Kriya/))
    const id = (activitiesApi.log as ReturnType<typeof vi.fn>).mock.calls[0][1].id
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(activitiesApi.removeLog).toHaveBeenCalledWith(id)
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('the Undo offer lasts 5 seconds', () => {
    renderApp(<ActivityButtons />, { activities, logs })
    fireEvent.click(btn(/^Kriya/))
    act(() => { vi.advanceTimersByTime(4900) })
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(200) })
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })
  it('each tap has its own id, so a retry of one tap can never double-count', () => {
    const { activitiesApi } = renderApp(<ActivityButtons />, { activities, logs })
    fireEvent.click(btn(/^Gym/)); fireEvent.click(btn(/^Gym/))
    const ids = (activitiesApi.log as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1].id)
    expect(new Set(ids).size).toBe(2)
  })
  it('are turned off while offline', () => {
    renderApp(<ActivityButtons />, { activities, logs })
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(btn(/^Gym/)).toBeDisabled()
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(btn(/^Gym/)).toBeEnabled()
  })
  it('have no emoji', () => {
    const { container } = renderApp(<ActivityButtons />, { activities, logs })
    expect(container.textContent).not.toMatch(/\p{Emoji_Presentation}/u)
  })

  describe('long-press and the ▾ button', () => {
    it('holding half a second opens the sheet instead of logging', () => {
      const { activitiesApi } = renderApp(<ActivityButtons />, { activities, logs })
      const b = btn(/^Gym/)
      fireEvent.pointerDown(b)
      act(() => { vi.advanceTimersByTime(520) })
      fireEvent.pointerUp(b)
      fireEvent.click(b)
      expect(screen.getByRole('dialog', { name: 'Gym logs' })).toHaveAttribute('open')
      expect(activitiesApi.log).not.toHaveBeenCalled()
    })
    it('a short press is a normal tap', () => {
      const { activitiesApi } = renderApp(<ActivityButtons />, { activities, logs })
      const b = btn(/^Gym/)
      fireEvent.pointerDown(b)
      act(() => { vi.advanceTimersByTime(200) })
      fireEvent.pointerUp(b)
      fireEvent.click(b)
      expect(activitiesApi.log).toHaveBeenCalledTimes(1)
    })
  })

  describe('the sheet', () => {
    const openSheet = () => { fireEvent.click(screen.getByRole('button', { name: /More for Gym/ })); return within(screen.getByRole('dialog', { name: 'Gym logs' })) }

    it('logs other minutes at an earlier time, read as Toronto time', () => {
      const { activitiesApi } = renderApp(<ActivityButtons />, { activities, logs })
      const sheet = openSheet()
      fireEvent.change(sheet.getByLabelText('Minutes'), { target: { value: '45' } })
      fireEvent.change(sheet.getByLabelText('Ended at (Toronto time)'), { target: { value: '2026-11-09T18:30' } }) // yesterday evening
      fireEvent.click(sheet.getByRole('button', { name: 'Log it' }))
      expect(activitiesApi.log).toHaveBeenCalledWith('gym', { minutes: 45, endedAt: new Date('2026-11-09T23:30:00Z') })
    })
    it('accepts 1h30 style minutes', () => {
      const { activitiesApi } = renderApp(<ActivityButtons />, { activities, logs })
      const sheet = openSheet()
      fireEvent.change(sheet.getByLabelText('Minutes'), { target: { value: '1h30' } })
      fireEvent.change(sheet.getByLabelText('Ended at (Toronto time)'), { target: { value: '2026-11-10T09:00' } })
      fireEvent.click(sheet.getByRole('button', { name: 'Log it' }))
      expect(activitiesApi.log).toHaveBeenCalledWith('gym', { minutes: 90, endedAt: new Date('2026-11-10T14:00:00Z') })
    })
    it('refuses a time in the future and bad minutes', () => {
      const { activitiesApi } = renderApp(<ActivityButtons />, { activities, logs })
      const sheet = openSheet()
      fireEvent.change(sheet.getByLabelText('Ended at (Toronto time)'), { target: { value: '2026-11-10T23:00' } })
      fireEvent.click(sheet.getByRole('button', { name: 'Log it' }))
      expect(sheet.getByRole('alert')).toHaveTextContent(/future/)
      fireEvent.change(sheet.getByLabelText('Ended at (Toronto time)'), { target: { value: '2026-11-10T08:00' } })
      fireEvent.change(sheet.getByLabelText('Minutes'), { target: { value: 'abc' } })
      fireEvent.click(sheet.getByRole('button', { name: 'Log it' }))
      expect(sheet.getByRole('alert')).toHaveTextContent(/Minutes/)
      expect(activitiesApi.log).not.toHaveBeenCalled()
    })
    it("lists this week's logs only, newest first, and deletes one", () => {
      const { activitiesApi } = renderApp(<ActivityButtons />, { activities, logs })
      const sheet = openSheet()
      const items = sheet.getAllByRole('listitem').map((li) => li.textContent)
      expect(items).toHaveLength(2) // g3 was last Sunday
      expect(items[0]).toMatch(/Tue 10 Nov · ended 8:00 am · 60 min/)
      expect(items[1]).toMatch(/Mon 9 Nov · ended 6:00 pm · 60 min/)
      expect(sheet.getByText(/This week · 2/)).toBeInTheDocument()
      fireEvent.click(sheet.getByRole('button', { name: /^Delete log: Mon 9 Nov/ }))
      expect(activitiesApi.removeLog).toHaveBeenCalledWith('g2')
    })
  })
})
