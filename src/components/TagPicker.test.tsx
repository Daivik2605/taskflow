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
    expect(screen.getByRole('button', { name: 'Tag' })).toHaveTextContent('DSAin Study')
  })
  it('shows "No tag" when nothing is chosen', () => {
    renderApp(<Harness />)
    expect(screen.getByRole('button', { name: 'Tag' })).toHaveTextContent('No tag')
  })
  it('lists parents with their sub-tags grouped beneath them', async () => {
    renderApp(<Harness />)
    await open()
    const study = within(screen.getByRole('group', { name: 'Study' }))
    expect(study.getAllByRole('option').map((o) => o.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Studygeneral', 'DSA', 'SQL'])
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
    expect(options.slice(0, 2)).toEqual(['SQL', 'Work'])
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

describe('tag picker, task shortlist', () => {
  const open = async (value: string | null = null) => {
    renderApp(<TagPicker value={value} onChange={vi.fn()} allowNone tasksOnly />)
    await userEvent.click(screen.getByRole('button', { name: 'Tag' }))
    return within(screen.getByRole('listbox', { name: 'Tag list' }))
  }
  it('offers No tag and the flagged tags only', async () => {
    const list = await open()
    expect(list.getAllByRole('option').map((o) => o.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['No tag', 'Studygeneral', 'DSA'])
  })
  it('shows an unflagged parent as a heading you cannot pick', async () => {
    const list = await open()
    expect(list.queryByRole('option', { name: /^Work/ })).toBeNull()
  })
  it('still shows a task\'s own tag when it is not flagged', async () => {
    const list = await open('a-personal')
    expect(list.getByRole('option', { name: /Personal/ })).toHaveAttribute('aria-selected', 'true')
  })
})

describe('tag picker "More tags…" (phase 3.7)', () => {
  const optionNames = () => screen.getAllByRole('option').map((o) => o.textContent?.replace(/\s+/g, ' ').trim())
  function Tasks3() {
    const [v, setV] = useState<string | null>(null)
    return <TagPicker value={v} onChange={setV} allowNone tasksOnly />
  }
  it('the task picker starts with the shortlist and ends with More tags…', async () => {
    renderApp(<Tasks3 />)
    await open()
    expect(optionNames()).toEqual(['No tag', 'Studygeneral', 'DSA'])
    expect(screen.getByRole('button', { name: 'More tags…' })).toBeInTheDocument()
  })
  it('More tags… reveals the whole tree, and an unflagged tag can be picked', async () => {
    renderApp(<Tasks3 />)
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'More tags…' }))
    expect(optionNames()).toEqual(expect.arrayContaining(['SQL', 'Work', 'Personal']))
    expect(screen.queryByRole('button', { name: 'More tags…' })).toBeNull()
    await userEvent.click(screen.getByRole('option', { name: 'SQL' }))
    expect(screen.getByRole('button', { name: 'Tag' })).toHaveTextContent('SQLin Study')
  })
  it('the full-tree pickers (no tasksOnly) have no More tags… row', async () => {
    renderApp(<Harness />)
    await open()
    expect(screen.queryByRole('button', { name: 'More tags…' })).toBeNull()
  })
})
