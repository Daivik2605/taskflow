import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { area } from '../../lib/fixtures'
import { AREAS, COUNTERS, fakeAreasApi, fakeCountersApi, renderApp } from '../../test-utils'
import { CountersSettings } from './CountersSettings'
import { TagsSettings } from './TagsSettings'

const edit = (name: string) => userEvent.click(screen.getByRole('button', { name: `Edit ${name}` }))

describe('Settings → Tags', () => {
  it('shows the tree: parents in order, sub-tags beneath', () => {
    renderApp(<TagsSettings />)
    const names = screen.getAllByRole('button', { name: /^Edit / }).map((b) => b.getAttribute('aria-label'))
    expect(names).toEqual(['Edit Study', 'Edit DSA', 'Edit SQL', 'Edit Work', 'Edit Personal'])
  })
  it('adds a sub-tag to a parent', async () => {
    const { areasApi } = renderApp(<TagsSettings />)
    await userEvent.click(screen.getByRole('button', { name: 'Add a sub-tag to Study' }))
    const form = within(screen.getByRole('form', { name: 'Add a sub-tag to Study' }))
    expect(form.queryByLabelText('Kind')).toBeNull() // a sub-tag takes its parent's kind
    await userEvent.type(form.getByLabelText('Name'), 'Python')
    await userEvent.type(form.getByLabelText('Emoji'), '🐍')
    await userEvent.click(form.getByRole('button', { name: 'Add sub-tag' }))
    expect(areasApi.add).toHaveBeenCalledWith(expect.objectContaining({ name: 'Python', parent_id: 'a-study', emoji: '🐍' }))
  })
  it('adds a parent tag with a kind', async () => {
    const { areasApi } = renderApp(<TagsSettings />)
    await userEvent.click(screen.getByRole('button', { name: '+ Add parent tag' }))
    const form = within(screen.getByRole('form', { name: 'Add a parent tag' }))
    await userEvent.type(form.getByLabelText('Name'), 'Health')
    await userEvent.selectOptions(form.getByLabelText('Kind'), 'wellness')
    await userEvent.click(form.getByRole('button', { name: 'Add parent tag' }))
    expect(areasApi.add).toHaveBeenCalledWith(expect.objectContaining({ name: 'Health', parent_id: null, kind: 'wellness' }))
  })
  it('shows the reason when a tag is refused', async () => {
    const add = vi.fn(async () => 'That parent already has a sub-tag with this name.')
    renderApp(<TagsSettings />, { areasApi: fakeAreasApi(AREAS, { add }) })
    await userEvent.click(screen.getByRole('button', { name: 'Add a sub-tag to Study' }))
    await userEvent.type(screen.getByLabelText('Name'), 'DSA')
    await userEvent.click(screen.getByRole('button', { name: 'Add sub-tag' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already has a sub-tag')
  })
  it('a parent can change kind; a sub-tag shows the inherited kind instead', async () => {
    const { areasApi } = renderApp(<TagsSettings />)
    await edit('Study')
    await userEvent.selectOptions(screen.getByLabelText(/^Kind/), 'hustle')
    expect(areasApi.update).toHaveBeenCalledWith('a-study', { kind: 'hustle' })
    await edit('Study') // close
    await edit('DSA')
    expect(screen.queryByLabelText(/^Kind/)).toBeNull()
    expect(screen.getByText(/inherited from its parent/)).toBeInTheDocument()
  })
  it('renames and sets an emoji', async () => {
    const { areasApi } = renderApp(<TagsSettings />)
    await edit('DSA')
    const name = screen.getByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Algorithms')
    await userEvent.clear(screen.getByLabelText('Emoji'))
    await userEvent.type(screen.getByLabelText('Emoji'), '🧮')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(areasApi.update).toHaveBeenCalledWith('a-dsa', { name: 'Algorithms', emoji: '🧮' })
  })
  it('changes colour from the swatches', async () => {
    const { areasApi } = renderApp(<TagsSettings />)
    await edit('SQL')
    await userEvent.click(screen.getByRole('radio', { name: '#ef4444' }))
    expect(areasApi.update).toHaveBeenCalledWith('a-sql', { color: '#ef4444' })
  })
  it('moves a sub-tag to another parent, or promotes it to a top-level tag', async () => {
    const { areasApi } = renderApp(<TagsSettings />)
    await edit('SQL')
    await userEvent.selectOptions(screen.getByLabelText('Parent'), 'a-work')
    expect(areasApi.update).toHaveBeenCalledWith('a-sql', { parent_id: 'a-work' })
    await userEvent.selectOptions(screen.getByLabelText('Parent'), '')
    expect(areasApi.update).toHaveBeenLastCalledWith('a-sql', { parent_id: null })
  })
  it('a parent with sub-tags cannot be moved under another', async () => {
    renderApp(<TagsSettings />)
    await edit('Study')
    expect(screen.queryByLabelText('Parent')).toBeNull()
    expect(screen.getByText(/has sub-tags, so it stays top-level/)).toBeInTheDocument()
  })
  it('reorders among siblings, and the two levels reorder separately', async () => {
    const { areasApi } = renderApp(<TagsSettings />)
    await userEvent.click(screen.getByRole('button', { name: 'Move down: DSA' }))
    expect(areasApi.reorder).toHaveBeenLastCalledWith([{ id: 'a-sql', sort: 0 }, { id: 'a-dsa', sort: 1 }])
    expect(screen.getByRole('button', { name: 'Move up: Study' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move down: Personal' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Move down: Study' }))
    expect(areasApi.reorder).toHaveBeenLastCalledWith(expect.arrayContaining([{ id: 'a-study', sort: 1 }, { id: 'a-work', sort: 0 }]))
  })
  it('archives a tag, and shows the reason when that is refused', async () => {
    const update = vi.fn(async (_id: string, p: { archived?: boolean }) => (p.archived ? 'Archive or move its sub-tags first.' : null))
    const { areasApi } = renderApp(<TagsSettings />, { areasApi: fakeAreasApi(AREAS, { update }) })
    await edit('Study')
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(areasApi.update).toHaveBeenCalledWith('a-study', { archived: true })
    expect(await screen.findByRole('alert')).toHaveTextContent('Archive or move its sub-tags first.')
  })
  it('lists archived tags apart and can restore them', async () => {
    const { areasApi } = renderApp(<TagsSettings />, { areas: [...AREAS, area({ id: 'a-old', name: 'Old tag', archived: true })] })
    expect(screen.getByRole('heading', { name: 'Archived' })).toBeInTheDocument()
    await edit('Old tag')
    await userEvent.click(screen.getByRole('button', { name: 'Restore' }))
    expect(areasApi.update).toHaveBeenCalledWith('a-old', { archived: false })
  })
  it('merges into another tag after confirming (and says what will happen)', async () => {
    const { areasApi } = renderApp(<TagsSettings />)
    await edit('SQL')
    await userEvent.selectOptions(screen.getByLabelText('Merge into'), 'a-dsa')
    await userEvent.click(screen.getByRole('button', { name: 'Merge…' }))
    expect(screen.getByText(/Move every task, preset, session and note from “SQL” to “Study › DSA”, then archive “SQL”/)).toBeInTheDocument()
    expect(areasApi.merge).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Yes, merge' }))
    expect(areasApi.merge).toHaveBeenCalledWith('a-sql', 'a-dsa')
  })
  it('only offers merge targets that would be allowed (not itself, not archived); a parent with sub-tags cannot be merged', async () => {
    renderApp(<TagsSettings />, { areas: [...AREAS, area({ id: 'a-old', name: 'Old tag', archived: true })] })
    await edit('SQL')
    const options = within(screen.getByLabelText('Merge into')).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Choose a tag…', 'Study', 'Study › DSA', 'Work', 'Personal'])
    await edit('SQL') // close it
    await edit('Study')
    // a parent that still has sub-tags can't be merged at all, so it explains instead of offering a list
    expect(screen.queryByLabelText('Merge into')).toBeNull()
    expect(screen.getByText(/first move or archive its sub-tags/)).toBeInTheDocument()
  })
})

describe('Settings → Counters', () => {
  it('lists counters in order, and reorders', async () => {
    const { countersApi } = renderApp(<CountersSettings />)
    expect(screen.getAllByRole('button', { name: /^Edit / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Edit Cigarette', 'Edit Weed'])
    expect(screen.getByRole('button', { name: 'Move up: Cigarette' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Move down: Cigarette' }))
    expect(countersApi.reorderCounters).toHaveBeenCalledWith([{ id: 'c-weed', sort: 0 }, { id: 'c-cig', sort: 1 }])
  })
  it('adds a counter with an emoji', async () => {
    const { countersApi } = renderApp(<CountersSettings />)
    await userEvent.type(screen.getByLabelText('New counter name'), 'Coffee')
    await userEvent.type(screen.getByLabelText('New counter emoji'), '☕')
    await userEvent.click(screen.getByRole('button', { name: 'Add counter' }))
    expect(countersApi.addCounter).toHaveBeenCalledWith({ name: 'Coffee', emoji: '☕', color: expect.stringMatching(/^#/) })
  })
  it('renames, changes the emoji, and archives', async () => {
    const { countersApi } = renderApp(<CountersSettings />)
    await edit('Weed')
    await userEvent.clear(screen.getByLabelText('Name'))
    await userEvent.type(screen.getByLabelText('Name'), 'Cannabis')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(countersApi.updateCounter).toHaveBeenCalledWith('c-weed', { name: 'Cannabis', emoji: '🌿' })
    await edit('Cigarette')
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(countersApi.updateCounter).toHaveBeenLastCalledWith('c-cig', { archived: true })
  })
  it('shows archived counters apart and shows a refusal', async () => {
    const updateCounter = vi.fn(async () => 'A counter with that name already exists.')
    renderApp(<CountersSettings />, { countersApi: fakeCountersApi([...COUNTERS, { id: 'c-old', name: 'Old', emoji: null, color: '#000000', sort: 5, archived: true }], [], { updateCounter }) })
    expect(screen.getByRole('heading', { name: 'Archived' })).toBeInTheDocument()
    await edit('Weed')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists')
  })
})
