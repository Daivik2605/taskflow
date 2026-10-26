import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CounterEvent } from '../lib/counters'
import { fakeCountersApi, polyfillDialog, renderApp } from '../test-utils'
import { CounterPills } from './CounterPills'

beforeAll(polyfillDialog)
// 2026-11-10 10:00 Toronto (EST) = 15:00Z
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] }); vi.setSystemTime(new Date('2026-11-10T15:00:00Z')) })
afterEach(() => { vi.useRealTimers() })

const ev = (id: string, counter: string, at: string, day: string, qty = 1): CounterEvent => ({ id, counter_id: counter, at, day, qty, note: null, reason: null })
const events = [
  ev('e1', 'c-cig', '2026-11-10T14:00:00Z', '2026-11-10'),
  ev('e2', 'c-cig', '2026-11-10T12:50:00Z', '2026-11-10'), // 2h 10m before "now"
  ev('e3', 'c-cig', '2026-11-09T20:00:00Z', '2026-11-09'),
  ev('e4', 'c-weed', '2026-11-08T20:00:00Z', '2026-11-08'),
]
const btn = (name: RegExp) => screen.getByRole('button', { name })

describe('counter pills', () => {
  it("show the short label and today's count", () => {
    renderApp(<CounterPills />, { events })
    expect(btn(/^Cigarette: 2 today/)).toHaveTextContent(/^Cig\s*2$/)
    expect(btn(/^Weed: 0 today/)).toHaveTextContent(/^Weed\s*0$/)
  })
  it('fall back to the full name when a counter has no short label', () => {
    renderApp(<CounterPills />, { counters: [{ id: 'c1', name: 'Alcohol', short_label: null, color: '#000000', sort: 0, archived: false, reasons: null }, { id: 'c2', name: 'Coffee', short_label: '  ', color: '#000000', sort: 1, archived: false, reasons: null }] })
    expect(btn(/^Alcohol: 0 today/)).toHaveTextContent(/^Alcohol\s*0$/)
    expect(btn(/^Coffee: 0 today/)).toHaveTextContent(/^Coffee\s*0$/)
  })
  it('tell how long ago the last tap was in the sheet', () => {
    renderApp(<CounterPills />, { events })
    fireEvent.click(screen.getByRole('button', { name: /More for Cigarette/ }))
    expect(within(screen.getByRole('dialog', { name: 'Cigarette taps' })).getByText('last: 1h 00m ago')).toBeInTheDocument()
  })
  it('say "none yet" in the sheet for a counter that was never tapped', () => {
    renderApp(<CounterPills />, { events: [] })
    fireEvent.click(screen.getByRole('button', { name: /More for Weed/ }))
    expect(within(screen.getByRole('dialog', { name: 'Weed taps' })).getByText('none yet')).toBeInTheDocument()
  })
  it('have no emoji', () => {
    const { container } = renderApp(<CounterPills />, { events })
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u)
  })
  it('one tap records +1 now, and offers Undo', async () => {
    const { countersApi } = renderApp(<CounterPills />, { events })
    fireEvent.click(btn(/^Cigarette/))
    expect(countersApi.tap).toHaveBeenCalledTimes(1)
    expect(countersApi.tap).toHaveBeenCalledWith('c-cig', { id: expect.any(String) })
    expect(screen.getByRole('status')).toHaveTextContent('Cig +1')
    expect(within(screen.getByRole('status')).getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })
  it('Undo removes that exact tap and the toast goes away', () => {
    const { countersApi } = renderApp(<CounterPills />, { events })
    fireEvent.click(btn(/^Cigarette/))
    const id = (countersApi.tap as ReturnType<typeof vi.fn>).mock.calls[0][1].id
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(countersApi.removeEvent).toHaveBeenCalledWith(id)
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('the Undo offer lasts 5 seconds', () => {
    renderApp(<CounterPills />, { events })
    fireEvent.click(btn(/^Weed/))
    act(() => { vi.advanceTimersByTime(4900) })
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(200) })
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
  })
  it('two quick taps are two events', () => {
    const { countersApi } = renderApp(<CounterPills />, { events })
    fireEvent.click(btn(/^Cigarette/)); fireEvent.click(btn(/^Cigarette/))
    expect(countersApi.tap).toHaveBeenCalledTimes(2)
    const ids = (countersApi.tap as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[1].id)
    expect(new Set(ids).size).toBe(2)
  })

  describe('long-press and "…"', () => {
    it('holding a button for half a second opens the sheet instead of tapping', () => {
      const { countersApi } = renderApp(<CounterPills />, { events })
      const b = btn(/^Cigarette/)
      fireEvent.pointerDown(b)
      act(() => { vi.advanceTimersByTime(520) })
      fireEvent.pointerUp(b)
      fireEvent.click(b) // the click that follows a long press
      expect(screen.getByRole('dialog', { name: 'Cigarette taps' })).toHaveAttribute('open')
      expect(countersApi.tap).not.toHaveBeenCalled()
    })
    it('a short press is a normal tap', () => {
      const { countersApi } = renderApp(<CounterPills />, { events })
      const b = btn(/^Cigarette/)
      fireEvent.pointerDown(b)
      act(() => { vi.advanceTimersByTime(200) })
      fireEvent.pointerUp(b)
      fireEvent.click(b)
      expect(countersApi.tap).toHaveBeenCalledTimes(1)
      expect(document.querySelectorAll('dialog[open]')).toHaveLength(0)
    })
    it('moving off the button cancels the hold', () => {
      renderApp(<CounterPills />, { events })
      const b = btn(/^Cigarette/)
      fireEvent.pointerDown(b)
      fireEvent.pointerLeave(b)
      act(() => { vi.advanceTimersByTime(900) })
      expect(document.querySelectorAll('dialog[open]')).toHaveLength(0)
    })
    it('the … button opens the same sheet', () => {
      renderApp(<CounterPills />, { events })
      fireEvent.click(screen.getByRole('button', { name: /More for Weed/ }))
      expect(screen.getByRole('dialog', { name: 'Weed taps' })).toHaveAttribute('open')
    })
  })

  describe('the sheet', () => {
    const openSheet = () => { fireEvent.click(screen.getByRole('button', { name: /More for Cigarette/ })); return within(screen.getByRole('dialog', { name: 'Cigarette taps' })) }

    it("lists today's taps newest first, in Toronto time", () => {
      renderApp(<CounterPills />, { events })
      const sheet = openSheet()
      const items = sheet.getAllByRole('listitem').map((li) => li.textContent)
      expect(items[0]).toMatch(/^9:00 am/) // 14:00Z
      expect(items[1]).toMatch(/^7:50 am/) // 12:50Z
      expect(sheet.getByText(/Today's taps · 2/)).toBeInTheDocument()
    })
    it('adds a tap at a past time, read as Toronto time (not the browser zone)', async () => {
      const { countersApi } = renderApp(<CounterPills />, { events })
      const sheet = openSheet()
      fireEvent.change(sheet.getByLabelText('When (Toronto time)'), { target: { value: '2026-11-10T08:15' } })
      fireEvent.change(sheet.getByLabelText('How many'), { target: { value: '2' } })
      fireEvent.change(sheet.getByLabelText(/^Note/), { target: { value: 'after breakfast' } })
      fireEvent.click(sheet.getByRole('button', { name: 'Add' }))
      expect(countersApi.tap).toHaveBeenCalledWith('c-cig', { at: new Date('2026-11-10T13:15:00Z'), qty: 2, note: 'after breakfast', reason: null }) // 08:15 EST
    })
    it('refuses a time in the future and a bad quantity', () => {
      const { countersApi } = renderApp(<CounterPills />, { events })
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
      const { countersApi } = renderApp(<CounterPills />, { events })
      const sheet = openSheet()
      fireEvent.click(sheet.getByRole('button', { name: 'Delete tap at 9:00 am' }))
      expect(countersApi.removeEvent).toHaveBeenCalledWith('e1')
    })
    it("edits a tap's time", () => {
      const { countersApi } = renderApp(<CounterPills />, { events })
      const sheet = openSheet()
      fireEvent.click(sheet.getByRole('button', { name: 'Edit tap at 9:00 am' }))
      expect(sheet.getByLabelText('Time')).toHaveValue('2026-11-10T09:00')
      fireEvent.change(sheet.getByLabelText('Time'), { target: { value: '2026-11-10T09:30' } })
      fireEvent.click(sheet.getByRole('button', { name: 'Save' }))
      expect(countersApi.editEvent).toHaveBeenCalledWith('e1', { at: new Date('2026-11-10T14:30:00Z'), qty: 1, note: null, reason: null })
    })
    it('links to the stats', () => {
      renderApp(<CounterPills />, { events })
      expect(openSheet().getByRole('link', { name: /See stats/ })).toHaveAttribute('href', '/insights?tab=counters&counter=c-cig')
    })
  })

  it('stay usable while offline: a tap still counts (it is queued and sent later)', () => {
    const { countersApi } = renderApp(<CounterPills />, { events })
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(btn(/^Cigarette/)).toBeEnabled()
    fireEvent.click(btn(/^Cigarette/))
    expect(countersApi.tap).toHaveBeenCalledTimes(1)
  })
  it('render nothing when there are no counters', () => {
    const { container } = renderApp(<CounterPills />, { countersApi: fakeCountersApi([], []) })
    expect(container.querySelector('[role="group"]')).toBeNull()
  })
  it('skip archived counters', () => {
    renderApp(<CounterPills />, { counters: [{ id: 'c1', name: 'Gone', short_label: null, color: '#000000', sort: 0, archived: true, reasons: null }, { id: 'c2', name: 'Here', short_label: null, color: '#000000', sort: 1, archived: false, reasons: null }] })
    expect(screen.queryByRole('button', { name: /^Gone/ })).toBeNull()
    expect(screen.getByRole('button', { name: /^Here/ })).toBeInTheDocument()
  })
})


describe('counters can be taken back down (phase 3.7)', () => {
  const sheetOf = () => { fireEvent.click(screen.getByRole('button', { name: /More for Cigarette/ })); return within(screen.getByRole('dialog', { name: 'Cigarette taps' })) }

  it('the sheet shows today\'s count with a large - and +', () => {
    renderApp(<CounterPills />, { events })
    const sheet = sheetOf()
    expect(sheet.getByLabelText('2 today')).toHaveTextContent('2')
    fireEvent.click(sheet.getByRole('button', { name: 'Add one to Cigarette' }))
    expect(screen.getAllByRole('button', { name: 'Add one to Cigarette' }).length).toBe(1)
  })
  it('- removes the most recent tap of today, and Undo puts the same tap back', () => {
    const { countersApi } = renderApp(<CounterPills />, { events })
    const sheet = sheetOf()
    fireEvent.click(sheet.getByRole('button', { name: 'Take one off Cigarette' }))
    expect(countersApi.removeEvent).toHaveBeenCalledWith('e1') // 14:00Z is later than 12:50Z
    fireEvent.click(sheet.getByRole('button', { name: 'Undo' }))
    expect(countersApi.tap).toHaveBeenCalledWith('c-cig', { id: 'e1', at: new Date('2026-11-10T14:00:00Z'), qty: 1, note: null, reason: null })
  })
  it('- is disabled at zero, so the count never goes below zero', () => {
    renderApp(<CounterPills />, { events })
    fireEvent.click(screen.getByRole('button', { name: /More for Weed/ }))
    const sheet = within(screen.getByRole('dialog', { name: 'Weed taps' }))
    expect(sheet.getByRole('button', { name: 'Take one off Weed' })).toBeDisabled()
  })
  it("lists today's taps each with Remove", () => {
    const { countersApi } = renderApp(<CounterPills />, { events })
    const sheet = sheetOf()
    fireEvent.click(sheet.getByRole('button', { name: 'Delete tap at 9:00 am' }))
    expect(sheet.getAllByRole('button', { name: /^Delete tap/ })[0]).toHaveTextContent('Remove')
    expect(countersApi.removeEvent).toHaveBeenCalledWith('e1')
  })
  it('the pill has a small - only when the count is above zero, and it takes one off with an Undo toast', () => {
    const { countersApi } = renderApp(<CounterPills />, { events })
    expect(screen.queryByRole('button', { name: 'Take one off Weed' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Take one off Cigarette' }))
    expect(countersApi.removeEvent).toHaveBeenCalledWith('e1')
    expect(screen.getByRole('status')).toHaveTextContent('Cig -1')
  })
})
