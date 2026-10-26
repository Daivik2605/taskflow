import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { area } from '../../lib/fixtures'
import { AREAS, COUNTERS, fakeAreasApi, fakeCountersApi, renderApp } from '../../test-utils'
import { ACTIVITIES, fakeActivitiesApi } from '../../test-utils'
import { ActivitiesSettings } from './ActivitiesSettings'
import { CountersSettings } from './CountersSettings'
import { TagsSettings } from './TagsSettings'
import { Settings } from '../Settings'

vi.mock('../../app/auth', () => ({ useAuth: () => ({ session: { user: { email: 'me@example.com' } }, signOut: vi.fn() }) }))

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
    await userEvent.click(form.getByRole('button', { name: 'Add sub-tag' }))
    expect(areasApi.add).toHaveBeenCalledWith(expect.objectContaining({ name: 'Python', parent_id: 'a-study' }))
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
  it('renames a tag', async () => {
    const { areasApi } = renderApp(<TagsSettings />)
    await edit('DSA')
    const name = screen.getByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Algorithms')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(areasApi.update).toHaveBeenCalledWith('a-dsa', { name: 'Algorithms' })
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
  it('adds a counter with a short label', async () => {
    const { countersApi } = renderApp(<CountersSettings />)
    await userEvent.type(screen.getByLabelText('New counter name'), 'Coffee')
    await userEvent.type(screen.getByLabelText('New counter short label'), 'Cof')
    await userEvent.click(screen.getByRole('button', { name: 'Add counter' }))
    expect(countersApi.addCounter).toHaveBeenCalledWith({ name: 'Coffee', short_label: 'Cof', color: expect.stringMatching(/^#/) })
  })
  it('renames, changes the short label, and archives', async () => {
    const { countersApi } = renderApp(<CountersSettings />)
    await edit('Weed')
    await userEvent.clear(screen.getByLabelText('Name'))
    await userEvent.type(screen.getByLabelText('Name'), 'Cannabis')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(countersApi.updateCounter).toHaveBeenCalledWith('c-weed', { name: 'Cannabis', short_label: 'Weed' })
    await edit('Cigarette')
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(countersApi.updateCounter).toHaveBeenLastCalledWith('c-cig', { archived: true })
  })
  it('shows archived counters apart and shows a refusal', async () => {
    const updateCounter = vi.fn(async () => 'A counter with that name already exists.')
    renderApp(<CountersSettings />, { countersApi: fakeCountersApi([...COUNTERS, { id: 'c-old', name: 'Old', short_label: null, color: '#000000', sort: 5, archived: true, reasons: null }], [], { updateCounter }) })
    expect(screen.getByRole('heading', { name: 'Archived' })).toBeInTheDocument()
    await edit('Weed')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists')
  })
})

describe('Settings → Tags, offer on tasks', () => {
  it('toggles whether a tag is offered on tasks', async () => {
    const { areasApi } = renderApp(<TagsSettings />)
    await edit('SQL')
    const box = screen.getByRole('checkbox', { name: /Show when adding a task/ })
    expect(box).not.toBeChecked()
    await userEvent.click(box)
    expect(areasApi.update).toHaveBeenCalledWith('a-sql', { show_for_tasks: true })
  })
  it('shows a flagged tag as checked and has no emoji field', async () => {
    renderApp(<TagsSettings />)
    await edit('DSA')
    expect(screen.getByRole('checkbox', { name: /Show when adding a task/ })).toBeChecked()
    expect(screen.queryByLabelText('Emoji')).toBeNull()
  })
})

describe('Settings → Counters, short label', () => {
  it('edits the short label the header pill shows', async () => {
    const { countersApi } = renderApp(<CountersSettings />)
    await edit('Cigarette')
    expect(screen.getByLabelText('Short label')).toHaveValue('Cig')
    await userEvent.clear(screen.getByLabelText('Short label'))
    await userEvent.type(screen.getByLabelText('Short label'), 'Ciggy')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(countersApi.updateCounter).toHaveBeenCalledWith('c-cig', { name: 'Cigarette', short_label: 'Ciggy' })
  })
  it('an empty short label is saved empty (the pill then uses the full name)', async () => {
    const { countersApi } = renderApp(<CountersSettings />)
    await edit('Weed')
    await userEvent.clear(screen.getByLabelText('Short label'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(countersApi.updateCounter).toHaveBeenCalledWith('c-weed', { name: 'Weed', short_label: '' })
  })
})

describe('Settings → Activities', () => {
  const render = (over = {}) => renderApp(<ActivitiesSettings />, { activitiesApi: fakeActivitiesApi(ACTIVITIES, [], over) })
  it('lists activities in order with tag, minutes and target', () => {
    render()
    expect(screen.getAllByRole('button', { name: /^Edit / }).map((b) => b.getAttribute('aria-label'))).toEqual(['Edit Kriya', 'Edit Gym'])
    expect(screen.getByRole('button', { name: 'Edit Gym' })).toHaveTextContent('Work · 60 min · 3 a week')
  })
  it('adds an activity on a tag with minutes and an optional weekly target', async () => {
    const { activitiesApi } = render()
    const form = within(screen.getByRole('form', { name: 'Add activity' }))
    await userEvent.type(form.getByLabelText('Name'), 'Run')
    await userEvent.click(form.getByRole('button', { name: 'Activity tag' }))
    await userEvent.click(screen.getByRole('option', { name: /Work/ }))
    await userEvent.clear(form.getByLabelText('Default minutes'))
    await userEvent.type(form.getByLabelText('Default minutes'), '25')
    await userEvent.type(form.getByLabelText(/Weekly target/), '4')
    await userEvent.click(form.getByRole('button', { name: 'Add activity' }))
    expect(activitiesApi.add).toHaveBeenCalledWith({ name: 'Run', area_id: 'a-work', default_minutes: 25, weekly_target: 4 })
  })
  it('needs a tag', async () => {
    const { activitiesApi } = render()
    const form = within(screen.getByRole('form', { name: 'Add activity' }))
    await userEvent.type(form.getByLabelText('Name'), 'Run')
    await userEvent.click(form.getByRole('button', { name: 'Add activity' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Pick a tag')
    expect(activitiesApi.add).not.toHaveBeenCalled()
  })
  it('edits name, minutes and target; an empty target means none', async () => {
    const { activitiesApi } = render()
    await edit('Gym')
    const minutes = screen.getAllByLabelText('Default minutes')[0]
    await userEvent.clear(minutes)
    await userEvent.type(minutes, '75')
    await userEvent.clear(screen.getAllByLabelText(/Weekly target/)[0])
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(activitiesApi.update).toHaveBeenCalledWith('act-gym', { name: 'Gym', area_id: 'a-work', default_minutes: 75, weekly_target: null })
  })
  it('hides an activity and moves it', async () => {
    const { activitiesApi } = render()
    expect(screen.getByRole('button', { name: 'Move up: Kriya' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Move down: Kriya' }))
    expect(activitiesApi.reorder).toHaveBeenCalledWith([{ id: 'act-gym', sort: 0 }, { id: 'act-kriya', sort: 1 }])
    await edit('Gym')
    await userEvent.click(screen.getByRole('button', { name: 'Hide' }))
    expect(activitiesApi.update).toHaveBeenLastCalledWith('act-gym', { archived: true })
  })
  it('shows a refusal from the data layer', async () => {
    render({ add: vi.fn(async () => 'An activity with that name already exists.') })
    const form = within(screen.getByRole('form', { name: 'Add activity' }))
    await userEvent.type(form.getByLabelText('Name'), 'Gym')
    await userEvent.click(form.getByRole('button', { name: 'Activity tag' }))
    await userEvent.click(screen.getAllByRole('option', { name: /Work/ })[0])
    await userEvent.click(form.getByRole('button', { name: 'Add activity' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists')
  })
})

describe('Settings → Counters → reasons', () => {
  it('edits the chip list: add, remove, and saves it cleaned', async () => {
    const { countersApi } = renderApp(<CountersSettings />)
    await edit('Cigarette')
    const box = within(screen.getByRole('group', { name: 'Reasons for Cigarette' }))
    expect(box.getByText('bored')).toBeInTheDocument()
    await userEvent.click(box.getByRole('button', { name: 'Remove bored' }))
    await userEvent.type(box.getByLabelText('New reason for Cigarette'), ' with coffee {Enter}')
    await userEvent.click(box.getByRole('button', { name: 'Save reasons' }))
    expect(countersApi.updateCounter).toHaveBeenLastCalledWith('c-cig', { reasons: ['stress', 'with coffee'] })
  })
  it('a counter with no reasons says so', async () => {
    renderApp(<CountersSettings />)
    await edit('Weed')
    expect(within(screen.getByRole('group', { name: 'Reasons for Weed' })).getByText(/No chips are shown/)).toBeInTheDocument()
  })
})

describe('Settings → Tags, what each tag is for (phase 3.7)', () => {
  it('says in one line what each tag is used for', () => {
    renderApp(<TagsSettings />)
    expect(screen.getAllByText(/Learning; counts as productive time/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Paid work and commute/)).toBeInTheDocument()
    expect(screen.getByText(/Time from dsa lands here/)).toBeInTheDocument()
  })
})

describe('Settings → Activities, more than once a day', () => {
  it('toggles the per-activity setting', async () => {
    const { activitiesApi } = renderApp(<ActivitiesSettings />, { activities: ACTIVITIES })
    await edit('Kriya')
    const box = screen.getByRole('checkbox', { name: /Can be done more than once a day/ })
    expect(box).not.toBeChecked()
    await userEvent.click(box)
    expect(activitiesApi.update).toHaveBeenCalledWith('act-kriya', { allow_multiple: true })
  })
})

describe('Settings → Screens', () => {
  it('Hide unfinished screens is on by default and can be switched off', async () => {
    const setHideUnfinished = vi.fn(async () => {})
    renderApp(<Settings />, { settingsApi: { setHideUnfinished } })
    const box = screen.getByRole('checkbox', { name: /Hide unfinished screens/ })
    expect(box).toBeChecked()
    await userEvent.click(box)
    expect(setHideUnfinished).toHaveBeenCalledWith(false)
  })
})
