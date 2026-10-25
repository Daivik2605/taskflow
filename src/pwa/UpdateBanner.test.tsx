import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = { needRefresh: false, setNeedRefresh: vi.fn(), updateServiceWorker: vi.fn() }
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({ needRefresh: [state.needRefresh, state.setNeedRefresh], offlineReady: [false, vi.fn()], updateServiceWorker: state.updateServiceWorker }),
}))
import { UpdateBanner } from './UpdateBanner'

beforeEach(() => { state.needRefresh = false; state.setNeedRefresh.mockClear(); state.updateServiceWorker.mockClear() })

describe('UpdateBanner', () => {
  it('shows nothing when there is no new version', () => {
    const { container } = render(<UpdateBanner />)
    expect(container).toBeEmptyDOMElement()
  })
  it('offers Reload when a new version is waiting, and reloads only when asked', () => {
    state.needRefresh = true
    render(<UpdateBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('A new version of TaskFlow is ready.')
    expect(state.updateServiceWorker).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(state.updateServiceWorker).toHaveBeenCalledWith(true)
  })
  it('can be dismissed', () => {
    state.needRefresh = true
    render(<UpdateBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(state.setNeedRefresh).toHaveBeenCalledWith(false)
  })
})
