import { act, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { More } from '../screens/More'
import { ConnectionBanner } from './ConnectionBanner'
import { ConnectionProvider } from './connection'
import { Shell } from './Shell'

function renderAt(path: string) {
  return render(
    <ConnectionProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route element={<Shell />}><Route index element={<p>today</p>} /><Route path="more" element={<More />} /><Route path="calendar" element={<p>calendar</p>} /></Route></Routes>
      </MemoryRouter>
    </ConnectionProvider>,
  )
}

describe('Shell', () => {
  it('has the five phone tabs in order: Today · Tasks · Timer · Insights · More', () => {
    renderAt('/')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['Today', 'Tasks', 'Timer', 'Insights', 'More'])
  })
  it('More lists Calendar, Inbox, Projects, Work, Settings', () => {
    renderAt('/more')
    const main = screen.getByRole('main')
    expect(within(main).getAllByRole('link').map((l) => l.textContent)).toEqual(['Calendar', 'Inbox', 'Projects', 'Work', 'Settings'])
  })
  it('the More tab stays highlighted on a page that lives under More (Calendar)', () => {
    renderAt('/calendar')
    const nav = screen.getByRole('navigation', { name: 'Main' })
    expect(within(nav).getByRole('link', { name: 'More' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Today' })).not.toHaveAttribute('aria-current')
  })
  it('the desktop sidebar lists everything in one place', () => {
    renderAt('/')
    const side = screen.getByRole('navigation', { name: 'Sidebar' })
    expect(within(side).getAllByRole('link').map((l) => l.textContent)).toEqual(['Today', 'Tasks', 'Timer', 'Insights', 'Calendar', 'Inbox', 'Projects', 'Work', 'Settings'])
  })
})

describe('ConnectionBanner', () => {
  it('shows nothing while online', () => {
    render(<ConnectionProvider><ConnectionBanner /></ConnectionProvider>)
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('warns and disables changes when the browser goes offline', async () => {
    render(<ConnectionProvider><ConnectionBanner /></ConnectionProvider>)
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(await screen.findByRole('alert')).toHaveTextContent(/offline.*changes are turned off/i)
    act(() => { window.dispatchEvent(new Event('online')) })
  })
})
