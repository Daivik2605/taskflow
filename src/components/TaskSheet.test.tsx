import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeTasksApi, makeTask, polyfillDialog, renderApp } from '../test-utils'
import { TaskRow } from './TaskRow'

beforeAll(polyfillDialog)
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-24T15:00:00Z')) }) // Sat 24 Oct, Toronto
afterEach(() => { vi.useRealTimers(); localStorage.clear() })

const open = async (api: ReturnType<typeof fakeTasksApi>, title: string) => {
  renderApp(<ul><TaskRow task={api.tasks.find((t) => t.title === title)!} today="2026-10-24" /></ul>, { api })
  await userEvent.click(screen.getByText(title))
}
const save = () => userEvent.click(screen.getByRole('button', { name: 'Save' }))

describe('task sheet', () => {
  it('saves only what changed', async () => {
    const api = fakeTasksApi([makeTask({ title: 'Pass G2', start_on: '2026-11-09', due_on: '2026-11-09' })])
    await open(api, 'Pass G2')
    const title = await screen.findByLabelText('Title')
    await userEvent.clear(title)
    await userEvent.type(title, 'Pass G2 road test')
    await save()
    expect(api.update).toHaveBeenCalledWith(api.tasks[0].id, { title: 'Pass G2 road test' })
  })
  it('does not call update when nothing changed', async () => {
    const api = fakeTasksApi([makeTask({ title: 'Pass G2', start_on: '2026-11-09', due_on: '2026-11-09' })])
    await open(api, 'Pass G2')
    await screen.findByLabelText('Title')
    await save()
    expect(api.update).not.toHaveBeenCalled()
  })
  it('says Tag and Labels, never Area', async () => {
    const api = fakeTasksApi([makeTask({ title: 'Pass G2' })])
    await open(api, 'Pass G2')
    await screen.findByLabelText('Title')
    expect(screen.getByRole('button', { name: 'Tag' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Labels/)).toBeInTheDocument()
    expect(screen.queryByText(/\bArea\b/)).toBeNull()
  })

  describe('When', () => {
    it('Pass G2 can be set to a hard deadline on 9 Nov — start day cleared so the countdown shows', async () => {
      const api = fakeTasksApi([makeTask({ title: 'Pass G2', start_on: '2026-11-09', due_on: '2026-11-09' })])
      await open(api, 'Pass G2')
      await userEvent.click(await screen.findByRole('radio', { name: 'Deadline' }))
      expect(screen.getByLabelText(/^Deadline$/)).toHaveValue('2026-11-09') // the day carries over
      await save()
      expect(api.update).toHaveBeenCalledWith(api.tasks[0].id, { start_on: null, hard_deadline: true })
    })
    it('a deadline can say when to start working', async () => {
      const api = fakeTasksApi([makeTask({ title: 'Pass G2' })])
      await open(api, 'Pass G2')
      await userEvent.click(await screen.findByRole('radio', { name: 'Deadline' }))
      await userEvent.type(screen.getByLabelText(/^Deadline$/), '2026-11-09')
      await userEvent.type(screen.getByLabelText(/Start working from/), '2026-11-02')
      await save()
      expect(api.update).toHaveBeenCalledWith(api.tasks[0].id, { start_on: '2026-11-02', due_on: '2026-11-09', hard_deadline: true })
    })
    it('"Next 2 weeks" fills a window from today through 13 days on', async () => {
      const api = fakeTasksApi([makeTask({ title: 'Finish DSA week 3' })])
      await open(api, 'Finish DSA week 3')
      await userEvent.click(await screen.findByRole('radio', { name: 'Window' }))
      await userEvent.click(screen.getByRole('button', { name: 'Next 2 weeks' }))
      expect(screen.getByLabelText('From')).toHaveValue('2026-10-24')
      expect(screen.getByLabelText('Until')).toHaveValue('2026-11-06')
      await save()
      expect(api.update).toHaveBeenCalledWith(api.tasks[0].id, { start_on: '2026-10-24', due_on: '2026-11-06' })
    })
    it('"This week" ends on the last day of the week (Monday start → Sunday 25 Oct)', async () => {
      const api = fakeTasksApi([makeTask({ title: 'Plan' })])
      await open(api, 'Plan')
      await userEvent.click(await screen.findByRole('radio', { name: 'Window' }))
      await userEvent.click(screen.getByRole('button', { name: 'This week' }))
      expect(screen.getByLabelText('Until')).toHaveValue('2026-10-25')
    })
    it('"On a day" sets start and due to that day; "No date" clears everything', async () => {
      const api = fakeTasksApi([makeTask({ title: 'Call bank' }), makeTask({ title: 'Dated', start_on: '2026-11-02', due_on: '2026-11-05' })])
      await open(api, 'Call bank')
      await userEvent.click(await screen.findByRole('radio', { name: 'On a day' }))
      await userEvent.clear(screen.getByLabelText('Day'))
      await userEvent.type(screen.getByLabelText('Day'), '2026-10-27')
      await save()
      expect(api.update).toHaveBeenCalledWith(api.tasks[0].id, { start_on: '2026-10-27', due_on: '2026-10-27' })
    })
    it('clearing a date with "No date"', async () => {
      const api = fakeTasksApi([makeTask({ title: 'Dated', start_on: '2026-11-02', due_on: '2026-11-05' })])
      await open(api, 'Dated')
      await userEvent.click(await screen.findByRole('radio', { name: 'No date' }))
      await save()
      expect(api.update).toHaveBeenCalledWith(api.tasks[0].id, { start_on: null, due_on: null })
    })
    it('refuses a window that ends before it starts, and a deadline with no day', async () => {
      const api = fakeTasksApi([makeTask({ title: 'Plan' })])
      await open(api, 'Plan')
      await userEvent.click(await screen.findByRole('radio', { name: 'Window' }))
      await userEvent.clear(screen.getByLabelText('Until'))
      await userEvent.type(screen.getByLabelText('Until'), '2026-10-20')
      await save()
      expect(await screen.findByRole('alert')).toHaveTextContent(/end on or after/)
      await userEvent.click(screen.getByRole('radio', { name: 'Deadline' }))
      await userEvent.clear(screen.getByLabelText(/^Deadline$/))
      await save()
      expect(screen.getByRole('alert')).toHaveTextContent(/deadline day/i)
      expect(api.update).not.toHaveBeenCalled()
    })
    it('a task made before revision 2 (due date, no start) opens as an open-ended window and saves untouched', async () => {
      const api = fakeTasksApi([makeTask({ title: 'Old', due_on: '2026-11-05' })])
      await open(api, 'Old')
      expect(await screen.findByRole('radio', { name: 'Window' })).toHaveAttribute('aria-checked', 'true')
      expect(screen.getByLabelText('From')).toHaveValue('')
      await save()
      expect(api.update).not.toHaveBeenCalled()
    })
  })

  describe('estimate', () => {
    it('reads 1h 30m as 90 minutes', async () => {
      const api = fakeTasksApi([makeTask({ title: 'Write report' })])
      await open(api, 'Write report')
      await userEvent.type(await screen.findByLabelText(/^Estimate/), '1h 30m')
      await save()
      expect(api.update).toHaveBeenCalledWith(api.tasks[0].id, { estimate_minutes: 90 })
    })
    it('shows an existing estimate and clears it when emptied', async () => {
      const api = fakeTasksApi([makeTask({ title: 'Write report', estimate_minutes: 120 })])
      await open(api, 'Write report')
      const est = await screen.findByLabelText(/^Estimate/)
      expect(est).toHaveValue('2h 00m')
      await userEvent.clear(est)
      await save()
      expect(api.update).toHaveBeenCalledWith(api.tasks[0].id, { estimate_minutes: null })
    })
    it('refuses something that is not a duration', async () => {
      const api = fakeTasksApi([makeTask({ title: 'Write report' })])
      await open(api, 'Write report')
      await userEvent.type(await screen.findByLabelText(/^Estimate/), 'soon')
      await save()
      expect(await screen.findByRole('alert')).toHaveTextContent(/1h 30m/)
      expect(api.update).not.toHaveBeenCalled()
    })
  })

  it('changes the tag with the picker', async () => {
    const api = fakeTasksApi([makeTask({ title: 'Pass G2', area_id: 'a-personal' })])
    await open(api, 'Pass G2')
    await userEvent.click(await screen.findByRole('button', { name: 'Tag' }))
    await userEvent.click(screen.getByRole('option', { name: /DSA/ }))
    await save()
    expect(api.update).toHaveBeenCalledWith(api.tasks[0].id, { area_id: 'a-dsa' })
  })
  it('edits owner and labels together', async () => {
    const api = fakeTasksApi([makeTask({ title: 'Pass G2' })])
    await open(api, 'Pass G2')
    await userEvent.type(await screen.findByLabelText(/^Labels/), 'dmv, urgent')
    await userEvent.clear(screen.getByLabelText('Owner'))
    await userEvent.type(screen.getByLabelText('Owner'), 'Anikait')
    await save()
    expect(api.update).toHaveBeenCalledWith(api.tasks[0].id, { owner: 'Anikait', tags: ['dmv', 'urgent'] })
  })
  it('adds a sub-task under the parent, inheriting its tag', async () => {
    const api = fakeTasksApi([makeTask({ title: 'Pass G2', area_id: 'a-personal' })])
    await open(api, 'Pass G2')
    await userEvent.type(await screen.findByLabelText('New sub-task'), 'Book road test')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(api.add).toHaveBeenCalledWith({ title: 'Book road test', parent_id: api.tasks[0].id, area_id: 'a-personal', project_id: null })
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
    const api = fakeTasksApi([parent, makeTask({ parent_id: parent.id, status: 'done', completed_at: '2026-10-24T12:00:00Z' }), makeTask({ parent_id: parent.id })])
    renderApp(<ul><TaskRow task={parent} today="2026-10-24" /></ul>, { api })
    expect(screen.getByText('1/2 sub-tasks')).toBeInTheDocument()
  })
})
