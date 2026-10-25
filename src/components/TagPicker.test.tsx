import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { area } from '../lib/fixtures'
import { AREAS, renderApp } from '../test-utils'
import { TagPicker } from './TagPicker'

beforeEach(() => localStorage.clear())

function Harness({ initial = null, allowNone = false, onChange = vi.fn() }: { initial?: string | null; allowNone?: boolean; onChange?: (id: string | null) => void }) {
  const [v, setV] = useState<string | null>(initial)
  return <TagPicker value={v} allowNone={allowNone} onChange={(id) => { setV(id); onChange(id) }} />
}
const open = () => userEvent.click(screen.getByRole('button', { name: 'Tag' }))

describe('tag picker', () => {
  it('shows the chosen tag with its parent, or "No tag"', () => {
    renderApp(<Harness initial="a-dsa" />)
    expect(screen.getByRole('button', { name: 'Tag' })).toHaveTextContent('🧩DSAin Study')
  })
  it('shows "No tag" when nothing is chosen', () => {
    renderApp(<Harness />)
    expect(screen.getByRole('button', { name: 'Tag' })).toHaveTextContent('No tag')
  })
  it('lists parents with their sub-tags grouped beneath them', async () => {
    renderApp(<Harness />)
    await open()
    const study = within(screen.getByRole('group', { name: 'Study' }))
    expect(study.getAllByRole('option').map((o) => o.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['📚Studygeneral', '🧩DSA', 'SQL'])
    expect(screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Study', 'Work', 'Personal'])
  })
  it('picking a parent is allowed (time goes to its general bucket)', async () => {
    const onChange = vi.fn()
    renderApp(<Harness onChange={onChange} />)
    await open()
    await userEvent.click(within(screen.getByRole('group', { name: 'Study' })).getByRole('option', { name: /Study/ }))
    expect(onChange).toHaveBeenCalledWith('a-study')
  })
  it('puts recent tags first, most recent first', async () => {
    localStorage.setItem('taskflow-recent-tags', JSON.stringify(['a-sql', 'a-work']))
    renderApp(<Harness />)
    await open()
    const options = screen.getAllByRole('option').map((o) => o.textContent?.replace(/\s+/g, ' ').trim())
    expect(options.slice(0, 2)).toEqual(['SQL', '💼Work'])
    expect(screen.getByText('Recent')).toBeInTheDocument()
  })
  it('remembers a pick, closes, and offers it first next time', async () => {
    const onChange = vi.fn()
    renderApp(<Harness onChange={onChange} />)
    await open()
    await userEvent.click(screen.getByRole('option', { name: /SQL/ }))
    expect(onChange).toHaveBeenCalledWith('a-sql')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(JSON.parse(localStorage.getItem('taskflow-recent-tags')!)).toEqual(['a-sql'])
    await open()
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('SQL')
  })
  it('offers "No tag" only when allowed', async () => {
    renderApp(<Harness initial="a-sql" allowNone />)
    await open()
    await userEvent.click(screen.getByRole('option', { name: 'No tag' }))
    expect(screen.getByRole('button', { name: 'Tag' })).toHaveTextContent('No tag')
  })
  it('does not offer "No tag" by default', async () => {
    renderApp(<Harness />)
    await open()
    expect(screen.queryByRole('option', { name: 'No tag' })).toBeNull()
  })
  it('hides archived tags, and ignores recent tags that are archived or gone', async () => {
    localStorage.setItem('taskflow-recent-tags', JSON.stringify(['a-old', 'ghost']))
    renderApp(<Harness />, { areas: [...AREAS, area({ id: 'a-old', name: 'Old tag', archived: true })] })
    await open()
    expect(screen.queryByText('Old tag')).toBeNull()
    expect(screen.queryByText('Recent')).toBeNull()
  })
})
