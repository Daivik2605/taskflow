import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MORE, moreItems } from '../app/nav'
import { renderApp } from '../test-utils'
import { Capture } from './Capture'
import { Calendar, Inbox, Projects } from './screens'
import { Work } from './Work'

describe('placeholder screens say what they will do (phase 3.7)', () => {
  it.each([
    ['Calendar', Calendar, 8, /Shifts, days off and sleep/],
    ['Inbox', Inbox, 9, /Quick capture/],
    ['Projects', Projects, 10, /going-cold warnings/],
    ['Work', Work, 6, /Shifts, pay rules/],
    ['Quick capture', Capture, 9, /lands in your Inbox/],
  ] as const)('%s: a one-line purpose and its phase', (title, Screen, phase, blurb) => {
    renderApp(<Screen />)
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    expect(screen.getByText(blurb)).toBeInTheDocument()
    expect(screen.getByText(`Coming in phase ${phase}.`)).toBeInTheDocument()
  })
})

describe('hide unfinished screens', () => {
  it('leaves placeholder screens out of the phone More list only when on', () => {
    expect(moreItems(true).map((m) => m.label)).toEqual(['Settings'])
    expect(moreItems(false)).toEqual(MORE)
  })
})
