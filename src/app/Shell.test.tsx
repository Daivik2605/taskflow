import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test-utils'
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

describe('Shell, counter pills', () => {
  const inShell = (path: string, over = {}) => {
    const utils = renderApp(
      <Routes><Route element={<Shell />}><Route index element={<p>today</p>} /><Route path="more" element={<More />} /><Route path="calendar" element={<p>calendar</p>} /></Route></Routes>,
      { route: path, ...over },
    )
    return utils
  }
  it.each(['/', '/more', '/calendar'])('shows the Cig and Weed pills at the top of %s', (path) => {
    inShell(path)
    const group = screen.getByRole('group', { name: 'Counters' })
    expect(within(group).getAllByRole('button', { name: /Tap to add one/ }).map((b) => b.textContent?.replace(/\s+/g, '').trim())).toEqual(['Cig0', 'Weed0'])
  })
  it('sits above the page content (top-left of every screen)', () => {
    inShell('/')
    const group = screen.getByRole('group', { name: 'Counters' })
    expect(group.compareDocumentPosition(screen.getByRole('main')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('a tap works from any page and offers Undo', () => {
    const { countersApi } = inShell('/calendar')
    fireEvent.click(screen.getByRole('button', { name: /^Weed: 0 today/ }))
    expect(countersApi.tap).toHaveBeenCalledWith('c-weed', { id: expect.any(String) })
    expect(screen.getByRole('status')).toHaveTextContent('Weed +1')
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(countersApi.removeEvent).toHaveBeenCalled()
  })
  it('shows no pill bar at all when there are no counters', () => {
    inShell('/', { counters: [] })
    expect(screen.queryByRole('group', { name: 'Counters' })).toBeNull()
  })
  it('keeps the pills from wrapping on a narrow phone (they scroll sideways instead)', () => {
    inShell('/')
    const group = screen.getByRole('group', { name: 'Counters' })
    expect(group.className).toMatch(/overflow-x-auto/)
    expect(group.className).not.toMatch(/flex-wrap/)
  })
})
