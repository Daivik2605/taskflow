import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CounterEvent } from '../lib/counters'
import { fakeCountersApi, polyfillDialog, renderApp } from '../test-utils'
import { CounterButtons } from './CounterButtons'

beforeAll(polyfillDialog)
// 2026-11-10 10:00 Toronto (EST) = 15:00Z
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] }); vi.setSystemTime(new Date('2026-11-10T15:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

const ev = (id: string, counter: string, at: string, day: string, qty = 1): CounterEvent => ({ id, counter_id: counter, at, day, qty, note: null })
const events = [
  ev('e1', 'c-cig', '2026-11-10T14:00:00Z', '2026-11-10'),
  ev('e2', 'c-cig', '2026-11-10T12:50:00Z', '2026-11-10'), // 2h 10m before "now"
  ev('e3', 'c-cig', '2026-11-09T20:00:00Z', '2026-11-09'),
  ev('e4', 'c-weed', '2026-11-08T20:00:00Z', '2026-11-08'),
]
const btn = (name: RegExp) => screen.getByRole('button', { name })

describe('counter buttons', () => {
  it("show today's count and how long ago the last tap was", () => {
    renderApp(<CounterButtons />, { events })
    expect(btn(/^Cigarette: 2 today/)).toHaveTextContent('2')
    expect(btn(/^Cigarette: 2 today/)).toHaveTextContent('last: 1h 00m ago')
    expect(btn(/^Weed: 0 today/)).toHaveTextContent('last: 1 day ago')
  })
  it('say "none yet" for a counter that was never tapped', () => {
    renderApp(<CounterButtons />, { events: [] })
    expect(btn(/^Weed: 0 today/)).toHaveTextContent('none yet')
  })
  it('one tap records +1 now, and offers Undo', async () => {
    const { countersApi } = renderApp(<CounterButtons />, { events })
    fireEvent.click(btn(/^Cigarette/))
    expect(countersApi.tap).toHaveBeenCalledTimes(1)
    expect(countersApi.tap).toHaveBeenCalledWith('c-cig', { id: expect.any(String) })
    expect(screen.getByRole('status')).toHaveTextContent('🚬 Cigarette +1')
    expect(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })
  it('Undo removes that exact tap and the toast goes away', () => {
    const { countersApi } = renderApp(<CounterButtons />, { events })
    fireEvent.click(btn(/^Cigarette/))
    const id = (countersApi.tap as ReturnType<typeof vi.fn>).mock.calls[0][1].id
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(countersApi.removeEvent).toHaveBeenCalledWith(id)
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('the Undo offer lasts 5 seconds', () => {
    renderApp(<CounterButtons />, { events })
    fireEvent.click(btn(/^Weed/))
    act(() => { vi.advanceTimersByTime(4900) })
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(200) })
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })
  it('two quick taps are two events', () => {
    const { countersApi } = renderApp(<CounterButtons />, { events })
    fireEvent.click(btn(/^Cigarette/)); fireEvent.click(btn(/^Cigarette/))
    expect(countersApi.tap).toHaveBeenCalledTimes(2)
    const ids = (countersApi.tap as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1].id)
    expect(new Set(ids).size).toBe(2)
  })

  describe('long-press and "…"', () => {
    it('holding a button for half a second opens the sheet instead of tapping', () => {
      const { countersApi } = renderApp(<CounterButtons />, { events })
      const b = btn(/^Cigarette/)
      fireEvent.pointerDown(b)
      act(() => { vi.advanceTimersByTime(520) })
      fireEvent.pointerUp(b)
      fireEvent.click(b) // the click that follows a long press
      expect(screen.getByRole('dialog', { name: 'Cigarette taps' })).toHaveAttribute('open')
      expect(countersApi.tap).not.toHaveBeenCalled()
    })
    it('a short press is a normal tap', () => {
      const { countersApi } = renderApp(<CounterButtons />, { events })
      const b = btn(/^Cigarette/)
      fireEvent.pointerDown(b)
      act(() => { vi.advanceTimersByTime(200) })
      fireEvent.pointerUp(b)
      fireEvent.click(b)
      expect(countersApi.tap).toHaveBeenCalledTimes(1)
      expect(document.querySelectorAll('dialog[open]')).toHaveLength(0)
    })
    it('moving off the button cancels the hold', () => {
      renderApp(<CounterButtons />, { events })
      const b = btn(/^Cigarette/)
      fireEvent.pointerDown(b)
      fireEvent.pointerLeave(b)
      act(() => { vi.advanceTimersByTime(900) })
      expect(document.querySelectorAll('dialog[open]')).toHaveLength(0)
    })
    it('the … button opens the same sheet', () => {
      renderApp(<CounterButtons />, { events })
      fireEvent.click(screen.getByRole('button', { name: /More for Weed/ }))
      expect(screen.getByRole('dialog', { name: 'Weed taps' })).toHaveAttribute('open')
    })
  })

  describe('the sheet', () => {
    const openSheet = () => { fireEvent.click(screen.getByRole('button', { name: /More for Cigarette/ })); return within(screen.getByRole('dialog', { name: 'Cigarette taps' })) }

    it("lists today's taps newest first, in Toronto time", () => {
      renderApp(<CounterButtons />, { events })
      const sheet = openSheet()
      const items = sheet.getAllByRole('listitem').map((li) => li.textContent)
      expect(items[0]).toMatch(/^9:00 am/) // 14:00Z
      expect(items[1]).toMatch(/^7:50 am/) // 12:50Z
      expect(sheet.getByText(/Today's taps · 2/)).toBeInTheDocument()
    })
    it('adds a tap at a past time, read as Toronto time (not the browser zone)', async () => {
      const { countersApi } = renderApp(<CounterButtons />, { events })
      const sheet = openSheet()
      fireEvent.change(sheet.getByLabelText('When (Toronto time)'), { target: { value: '2026-11-10T08:15' } })
      fireEvent.change(sheet.getByLabelText('How many'), { target: { value: '2' } })
      fireEvent.change(sheet.getByLabelText(/^Note/), { target: { value: 'after breakfast' } })
      fireEvent.click(sheet.getByRole('button', { name: 'Add' }))
      expect(countersApi.tap).toHaveBeenCalledWith('c-cig', { at: new Date('2026-11-10T13:15:00Z'), qty: 2, note: 'after breakfast' }) // 08:15 EST
    })
    it('refuses a time in the future and a bad quantity', () => {
      const { countersApi } = renderApp(<CounterButtons />, { events })
      const sheet = openSheet()
      fireEvent.change(sheet.getByLabelText('When (Toronto time)'), { target: { value: '2026-11-10T23:00' } })
      fireEvent.click(sheet.getByRole('button', { name: 'Add' }))
      expect(sheet.getByRole('alert')).toHaveTextContent(/future/)
      fireEvent.change(sheet.getByLabelText('When (Toronto time)'), { target: { value: '2026-11-10T08:00' } })
      fireEvent.change(sheet.getByLabelText('How many'), { target: { value: '0' } })
      fireEvent.click(sheet.getByRole('button', { name: 'Add' }))
      expect(sheet.getByRole('alert')).toHaveTextContent(/1 or more/)
      expect(countersApi.tap).not.toHaveBeenCalled()
    })
    it("deletes one of today's taps", () => {
      const { countersApi } = renderApp(<CounterButtons />, { events })
      const sheet = openSheet()
      fireEvent.click(sheet.getByRole('button', { name: 'Delete tap at 9:00 am' }))
      expect(countersApi.removeEvent).toHaveBeenCalledWith('e1')
    })
    it("edits a tap's time", () => {
      const { countersApi } = renderApp(<CounterButtons />, { events })
      const sheet = openSheet()
      fireEvent.click(sheet.getByRole('button', { name: 'Edit tap at 9:00 am' }))
      expect(sheet.getByLabelText('Time')).toHaveValue('2026-11-10T09:00')
      fireEvent.change(sheet.getByLabelText('Time'), { target: { value: '2026-11-10T09:30' } })
      fireEvent.click(sheet.getByRole('button', { name: 'Save' }))
      expect(countersApi.editEvent).toHaveBeenCalledWith('e1', { at: new Date('2026-11-10T14:30:00Z'), qty: 1, note: null })
    })
    it('links to the stats', () => {
      renderApp(<CounterButtons />, { events })
      expect(openSheet().getByRole('link', { name: /See stats/ })).toHaveAttribute('href', '/insights?tab=counters&counter=c-cig')
    })
  })

  it('are turned off while offline', () => {
    renderApp(<CounterButtons />, { events })
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(btn(/^Cigarette/)).toBeDisabled()
    act(() => { window.dispatchEvent(new Event('online')) })
    expect(btn(/^Cigarette/)).toBeEnabled()
  })
  it('render nothing when there are no counters', () => {
    const { container } = renderApp(<CounterButtons />, { countersApi: fakeCountersApi([], []) })
    expect(container.querySelector('[role="group"]')).toBeNull()
  })
  it('skip archived counters', () => {
    renderApp(<CounterButtons />, { counters: [{ id: 'c1', name: 'Gone', emoji: null, color: '#000000', sort: 0, archived: true }, { id: 'c2', name: 'Here', emoji: null, color: '#000000', sort: 1, archived: false }] })
    expect(screen.queryByRole('button', { name: /^Gone/ })).toBeNull()
    expect(screen.getByRole('button', { name: /^Here/ })).toBeInTheDocument()
  })
})

