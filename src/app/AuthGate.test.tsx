import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: null, supabaseConfigured: true }))
vi.mock('./auth', () => ({ useAuth: () => ({ session: null, loading: false, seed: { status: 'idle' }, retrySeed: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }) }))
import { AuthGate } from './AuthGate'

describe('sign-in screen (the app is on a public URL)', () => {
  it('only signs in: no sign-up, register or create-account option', () => {
    const { container } = render(<AuthGate><p>app</p></AuthGate>)
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.queryByText('app')).toBeNull()
    expect(container.textContent).not.toMatch(/sign.?up|register|create (an )?account|new account/i)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
