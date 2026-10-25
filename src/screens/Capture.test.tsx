import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test-utils'
import { Capture } from './Capture'

describe('/capture (home-screen shortcut)', () => {
  it('is a placeholder until the Inbox exists, with a way to add a task meanwhile', () => {
    renderApp(<Capture />, { route: '/capture' })
    expect(screen.getByRole('heading', { name: 'Quick capture' })).toBeInTheDocument()
    expect(screen.getByText(/phase 9/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('href', '/tasks')
  })
})
