import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OutboxContext, type OutboxApi } from '../data/outbox'
import type { Op, QItem } from '../lib/syncQueue'
import { SyncChip } from './SyncChip'

const op = (id: string): Op => ({ kind: 'counter.tap', row: { id, counter_id: 'c', at: '2026-11-10T15:00:00Z', day: '2026-11-10', qty: 1, note: null, reason: null } })
const item = (seq: number, over: Partial<QItem> = {}): QItem => ({ seq, op: op(`e${seq}`), queuedAt: '2026-11-10T15:00:00.000Z', tries: 0, status: 'pending', ...over })
const api = (items: QItem[], over: Partial<OutboxApi> = {}): OutboxApi => ({
  items, pending: items.filter((i) => i.status === 'pending').length, failed: items.filter((i) => i.status === 'failed'), syncing: false,
  enqueue: vi.fn(), hasPending: () => items.length > 0, retry: vi.fn(), retryAll: vi.fn(), discard: vi.fn(), ...over,
})
const show = (a: OutboxApi) => render(<OutboxContext.Provider value={a}><SyncChip /></OutboxContext.Provider>)

describe('sync chip', () => {
  it('shows nothing when nothing is waiting', () => {
    const { container } = show(api([]))
    expect(container).toBeEmptyDOMElement()
  })
  it('says how many are waiting to sync', () => {
    show(api([item(1), item(2), item(3)]))
    expect(screen.getByRole('button', { name: '3 waiting to sync' })).toBeInTheDocument()
  })
  it('says Syncing while it sends', () => {
    show(api([item(1)], { syncing: true }))
    expect(screen.getByRole('button', { name: 'Syncing 1…' })).toBeInTheDocument()
  })
  it('opens a list of what is waiting', () => {
    show(api([item(1), item(2)]))
    fireEvent.click(screen.getByRole('button', { name: '2 waiting to sync' }))
    expect(within(screen.getByRole('group', { name: 'Waiting changes' })).getAllByRole('listitem')).toHaveLength(2)
  })
  it('failed writes show why, with Retry and Discard', () => {
    const a = api([item(1, { status: 'failed', tries: 3, error: 'violates foreign key' }), item(2)])
    show(a)
    fireEvent.click(screen.getByRole('button', { name: "1 couldn't sync" }))
    expect(screen.getByText(/Not saved: violates foreign key/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry: Counter tap' }))
    expect(a.retry).toHaveBeenCalledWith(1)
    fireEvent.click(screen.getByRole('button', { name: 'Discard: Counter tap' }))
    expect(a.discard).toHaveBeenCalledWith(1)
  })
  it('offers Retry all when several failed', () => {
    const a = api([item(1, { status: 'failed', error: 'x' }), item(2, { status: 'failed', error: 'y' })])
    show(a)
    fireEvent.click(screen.getByRole('button', { name: "2 couldn't sync" }))
    fireEvent.click(screen.getByRole('button', { name: 'Retry all' }))
    expect(a.retryAll).toHaveBeenCalled()
  })
})
