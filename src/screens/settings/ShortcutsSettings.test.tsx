import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hashToken } from '../../lib/apiToken'
import { renderApp } from '../../test-utils'
import { ShortcutsSettings } from './ShortcutsSettings'

interface Row { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null; token_hash?: string }
let rows: Row[] = []
let logRows: unknown[] = []
const inserted: Row[] = []
const updates: { patch: unknown; id: string }[] = []

function builder(table: string) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'order', 'limit', 'is']) b[m] = () => b
  b.insert = (r: Row) => { const row = { ...r, id: `new-${inserted.length}`, created_at: '2026-11-10T15:00:00Z', last_used_at: null, revoked_at: null }; inserted.push(row); rows = [row, ...rows]; return Promise.resolve({ error: null }) }
  b.update = (patch: Record<string, unknown>) => ({ eq: (_c: string, id: string) => ({ is: () => { updates.push({ patch, id }); rows = rows.map((r) => (r.id === id ? { ...r, ...patch } as Row : r)); return Promise.resolve({ error: null }) } }) })
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: table === 'taskflow_api_tokens' ? rows : logRows, error: null }).then(ok)
  return b
}
vi.mock('../../data/db', () => ({ db: () => ({ from: (t: string) => builder(t) }), friendlyDbError: (e: { message: string }) => e.message }))

const writeText = vi.fn(async () => {})
beforeEach(() => {
  rows = []; logRows = []; inserted.length = 0; updates.length = 0; writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co/')
})

describe('Settings → Shortcuts', () => {
  it('shows the address the Shortcuts call, with a Copy button', async () => {
    renderApp(<ShortcutsSettings />)
    expect(await screen.findByText('https://abc.supabase.co/functions/v1/taskflow-api')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith('https://abc.supabase.co/functions/v1/taskflow-api')
  })
  it('creates a token: stores only its hash and prefix, and shows the token once', async () => {
    renderApp(<ShortcutsSettings />)
    await screen.findByText('No tokens yet.')
    await userEvent.type(screen.getByLabelText('Token name'), 'iPhone')
    await userEvent.click(screen.getByRole('button', { name: 'Create token' }))
    const shown = (await screen.findByLabelText('New token')).textContent!
    expect(shown).toMatch(/^tfk_[A-Za-z0-9_-]{43}$/)
    expect(inserted).toHaveLength(1)
    expect(inserted[0].token_hash).toBe(await hashToken(shown))
    expect(inserted[0].prefix).toBe(`${shown.slice(0, 8)}…`)
    expect(JSON.stringify(inserted[0])).not.toContain(shown) // the secret itself is never sent to the table
    fireEvent.click(screen.getByRole('button', { name: 'Copy token' }))
    expect(writeText).toHaveBeenCalledWith(shown)
    fireEvent.click(screen.getByRole('button', { name: "I've saved it" }))
    expect(screen.queryByLabelText('New token')).toBeNull() // gone for good
    expect(screen.getByRole('list', { name: 'API tokens' })).toHaveTextContent('iPhone')
    expect(screen.getByRole('list', { name: 'API tokens' })).not.toHaveTextContent(shown)
  })
  it('needs a name', async () => {
    renderApp(<ShortcutsSettings />)
    await screen.findByText('No tokens yet.')
    expect(screen.getByRole('button', { name: 'Create token' })).toBeDisabled()
  })
  it('revokes after a confirm, and a revoked token is marked', async () => {
    rows = [{ id: 't1', name: 'iPhone', prefix: 'tfk_Ab12…', created_at: '2026-11-09T15:00:00Z', last_used_at: '2026-11-10T14:00:00Z', revoked_at: null }]
    renderApp(<ShortcutsSettings />)
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke iPhone' }))
    expect(updates).toHaveLength(0) // not yet: it asks first
    fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke iPhone' }))
    await waitFor(() => expect(updates).toHaveLength(1))
    expect(updates[0]).toMatchObject({ id: 't1', patch: { revoked_at: expect.any(String) } })
    expect(await screen.findByText('revoked')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Revoke iPhone/ })).toBeNull()
  })
  it('lists last used and recent calls, with the reason for a failed one', async () => {
    rows = [{ id: 't1', name: 'iPhone', prefix: 'tfk_Ab12…', created_at: '2026-11-09T15:00:00Z', last_used_at: null, revoked_at: null }]
    logRows = [{ id: 'l1', endpoint: 'counter', at: '2026-11-10T15:00:00Z', ok: true, detail: null }, { id: 'l2', endpoint: 'counter', at: '2026-11-10T15:01:00Z', ok: false, detail: "I couldn't find a counter called tea." }]
    renderApp(<ShortcutsSettings />)
    const list = await screen.findByRole('list', { name: 'API tokens' })
    expect(within(list).getByText(/never used/)).toBeInTheDocument()
    const calls = within(screen.getByRole('list', { name: 'Recent API calls' })).getAllByRole('listitem')
    expect(calls).toHaveLength(2)
    expect(calls[1]).toHaveTextContent("I couldn't find a counter called tea.")
  })
})
