import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it } from 'vitest'
import { fakeTasksApi, makeTask, renderApp } from '../test-utils'
import { TaskRow } from './TaskRow'

// jsdom has no <dialog> behaviour yet.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }
})

const open = async (api: ReturnType<typeof fakeTasksApi>, title: string) => {
  renderApp(<ul><TaskRow task={api.tasks.find((t) => t.title === title)!} today="2026-11-10" /></ul>, { api })
  await userEvent.click(screen.getByText(title))
}

describe('task sheet', () => {
  it('saves only what changed', async () => {
    const api = fakeTasksApi([makeTask({ title: 'Pass G2', due_on: '2026-11-09' })])
    await open(api, 'Pass G2')
    const title = await screen.findByLabelText('Title')
    await userEvent.clear(title)
    await userEvent.type(title, 'Pass G2 road test')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(api.update).toHaveBeenCalledWith(api.tasks[0].id, { title: 'Pass G2 road test' })
  })
  it('edits due date, tags and owner together', async () => {
    const api = fakeTasksApi([makeTask({ title: 'Pass G2' })])
    await open(api, 'Pass G2')
    await userEvent.type(await screen.findByLabelText('Due date'), '2026-11-09')
    await userEvent.type(screen.getByLabelText(/Tags/), 'dmv, urgent')
    await userEvent.clear(screen.getByLabelText('Owner'))
    await userEvent.type(screen.getByLabelText('Owner'), 'Anikait')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(api.update).toHaveBeenCalledWith(api.tasks[0].id, { due_on: '2026-11-09', tags: ['dmv', 'urgent'], owner: 'Anikait' })
  })
  it('does not call update when nothing changed', async () => {
    const api = fakeTasksApi([makeTask({ title: 'Pass G2' })])
    await open(api, 'Pass G2')
    await screen.findByLabelText('Title')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(api.update).not.toHaveBeenCalled()
  })
  it('adds a sub-task under the parent, inheriting its area', async () => {
    const api = fakeTasksApi([makeTask({ title: 'Pass G2', area_id: 'a-life' })])
    await open(api, 'Pass G2')
    await userEvent.type(await screen.findByLabelText('New sub-task'), 'Book road test')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(api.add).toHaveBeenCalledWith({ title: 'Book road test', parent_id: api.tasks[0].id, area_id: 'a-life', project_id: null })
  })
  it('asks before deleting', async () => {
    const api = fakeTasksApi([makeTask({ title: 'Pass G2' })])
    await open(api, 'Pass G2')
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    expect(api.remove).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Yes, delete' }))
    expect(api.remove).toHaveBeenCalledWith(api.tasks[0].id)
  })
  it('sub-tasks show progress on the parent row', () => {
    const parent = makeTask({ title: 'Parent' })
    const api = fakeTasksApi([parent, makeTask({ parent_id: parent.id, status: 'done', completed_at: '2026-11-10T12:00:00Z' }), makeTask({ parent_id: parent.id })])
    renderApp(<ul><TaskRow task={parent} today="2026-11-10" /></ul>, { api })
    expect(screen.getByText('1/2 sub-tasks')).toBeInTheDocument()
  })
})
