import { render, screen, within } from '@testing-library/react'
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
        <Routes><Route element={<Shell />}><Route index element={<p>today</p>} /><Route path="more" element={<More />} /></Route></Routes>
      </MemoryRouter>
    </ConnectionProvider>,
  )
}

describe('Shell', () => {
  it('has the five tabs in order', () => {
    renderAt('/')
    const nav = screen.getAllByRole('navigation', { name: 'Main' }).at(-1)!
    expect(within(nav).getAllByRole('link').map((l) => l.textContent)).toEqual(['Today', 'Tasks', 'Timer', 'Calendar', 'More'])
  })
  it('More lists Inbox, Projects, Work, Settings', () => {
    renderAt('/more')
    const main = screen.getByRole('main')
    expect(within(main).getAllByRole('link').map((l) => l.textContent)).toEqual(['Inbox', 'Projects', 'Work', 'Settings'])
  })
})

describe('ConnectionBanner', () => {
  it('shows nothing while online', () => {
    render(<ConnectionProvider><ConnectionBanner /></ConnectionProvider>)
    expect(screen.queryByRole('alert')).toBeNull()
  })
  it('warns and disables changes when the browser goes offline', async () => {
    render(<ConnectionProvider><ConnectionBanner /></ConnectionProvider>)
    window.dispatchEvent(new Event('offline'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/offline.*changes are turned off/i)
    window.dispatchEvent(new Event('online'))
  })
})
