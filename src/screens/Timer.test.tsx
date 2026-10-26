import { act, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTask, polyfillDialog, renderApp } from '../test-utils'
import { newSession, pastSession, pause, stop } from '../lib/timer'
import { Timer } from './Timer'

beforeAll(polyfillDialog)
// Tue 10 Nov 2026, 10:00 Toronto (EST) = 15:00Z
beforeEach(() => { localStorage.clear(); vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] }); vi.setSystemTime(new Date('2026-11-10T15:00:00Z')) })
afterEach(() => vi.useRealTimers())

const at = (iso: string) => new Date(iso)
const running = () => newSession('s1', 'g1', { areaId: 'a-dsa', taskId: 't1', comment: 'chapter 3' }, at('2026-11-10T14:00:00Z')) // started 9:00, 1h ago
const tasks = [makeTask({ id: 't1', title: 'Finish Week 3', area_id: 'a-dsa' }), makeTask({ id: 't2', title: 'No tag task' })]
const pickTag = (name: string, label = 'Timer tag') => {
  fireEvent.click(screen.getByRole('button', { name: label }))
  fireEvent.click(within(screen.getByRole('listbox', { name: `${label} list` })).getByRole('option', { name }))
}

describe('Timer screen, starting', () => {
  it('asks for a tag, then starts with tag, task and comment', () => {
    const { timerApi } = renderApp(<Timer />, { tasks })
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/Pick a tag/)
    expect(timerApi.requestStart).not.toHaveBeenCalled()
    pickTag('SQL')
    fireEvent.change(screen.getByLabelText('Timer task'), { target: { value: 't1' } }) // picking a task also sets its tag
    fireEvent.change(within(screen.getByRole('form', { name: 'Start a timer' })).getByLabelText(/^Comment/), { target: { value: 'warm up' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(timerApi.requestStart).toHaveBeenCalledWith({ areaId: 'a-dsa', taskId: 't1', comment: 'warm up' })
  })
  it('the tag picker offers the full tree, not just the task shortlist', () => {
    renderApp(<Timer />, { tasks })
    fireEvent.click(screen.getByRole('button', { name: 'Timer tag' }))
    const names = within(screen.getByRole('listbox', { name: 'Timer tag list' })).getAllByRole('option').map((o) => o.textContent?.replace(/\s+/g, ' ').trim())
    expect(names).toEqual(expect.arrayContaining(['SQL', 'Work', 'Personal']))
  })
  it('opened from a task with no tag (?task=), preselects the task', () => {
    renderApp(<Timer />, { tasks, route: '/timer?task=t2' })
    expect(screen.getByLabelText('Timer task')).toHaveValue('t2')
  })
})

describe('Timer screen, running', () => {
  it('shows the live clock for the running session, tag, task and comment', () => {
    renderApp(<Timer />, { tasks, sessions: [running()] })
    expect(screen.getByRole('timer')).toHaveTextContent('1:00:00')
    const card = within(screen.getByRole('region', { name: 'Running timer' }))
    expect(card.getByText('Finish Week 3')).toBeInTheDocument()
    expect(card.getByLabelText('Comment')).toHaveValue('chapter 3')
    expect(screen.queryByRole('form', { name: 'Start a timer' })).toBeNull()
    act(() => { vi.advanceTimersByTime(5000) })
  })
  it('Pause then Resume, and Stop sends the typed comment', () => {
    const paused = pause(running(), at('2026-11-10T14:30:00Z'))
    const a = renderApp(<Timer />, { tasks, sessions: [running()] })
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(a.timerApi.pause).toHaveBeenCalled()
    fireEvent.change(within(screen.getByRole('region', { name: 'Running timer' })).getByLabelText('Comment'), { target: { value: 'done, ch 3 and 4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(a.timerApi.stop).toHaveBeenCalledWith({ comment: 'done, ch 3 and 4' })
    a.unmount()
    const b = renderApp(<Timer />, { tasks, sessions: [paused] })
    expect(screen.getByRole('timer')).toHaveTextContent('0:30:00') // paused: the clock stands still
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(b.timerApi.resume).toHaveBeenCalled()
  })
  it('saves a changed comment when the field loses focus', () => {
    const { timerApi } = renderApp(<Timer />, { tasks, sessions: [running()] })
    const c = within(screen.getByRole('region', { name: 'Running timer' })).getByLabelText('Comment')
    fireEvent.change(c, { target: { value: 'new note' } })
    fireEvent.blur(c)
    expect(timerApi.setComment).toHaveBeenCalledWith('s1', 'new note')
  })
})

describe('Timer screen, past sessions and today', () => {
  const done = stop(newSession('d1', 'dg1', { areaId: 'a-sql', comment: 'practice' }, at('2026-11-10T13:00:00Z')), at('2026-11-10T14:15:00Z')) // 8:00-9:15
  const manual = pastSession('m1', 'mg1', { areaId: 'a-personal', comment: 'Called Mom', start: at('2026-11-10T11:00:00Z'), end: at('2026-11-10T11:40:00Z') })

  it('adds a past session from a duration', () => {
    const { timerApi } = renderApp(<Timer />, { tasks })
    fireEvent.click(screen.getByText('Add a past session'))
    const form = within(screen.getByRole('form', { name: 'Add a past session' }))
    fireEvent.click(form.getByRole('button', { name: 'Past session tag' }))
    fireEvent.click(within(screen.getByRole('listbox', { name: 'Past session tag list' })).getByRole('option', { name: 'Personal' }))
    fireEvent.change(form.getByLabelText('Started (Toronto time)'), { target: { value: '2026-11-10T08:00' } })
    fireEvent.change(form.getByLabelText('Duration'), { target: { value: '40' } })
    fireEvent.change(form.getByLabelText('Comment'), { target: { value: 'Called Mom' } })
    fireEvent.click(form.getByRole('button', { name: 'Add session' }))
    expect(timerApi.addPast).toHaveBeenCalledWith({ areaId: 'a-personal', taskId: null, comment: 'Called Mom', start: at('2026-11-10T13:00:00Z'), end: at('2026-11-10T13:40:00Z') })
  })
  it('needs a tag and a duration or an end', () => {
    const { timerApi } = renderApp(<Timer />, { tasks })
    fireEvent.click(screen.getByText('Add a past session'))
    const form = within(screen.getByRole('form', { name: 'Add a past session' }))
    fireEvent.click(form.getByRole('button', { name: 'Add session' }))
    expect(form.getByRole('alert')).toHaveTextContent(/Pick a tag/)
    fireEvent.click(form.getByRole('button', { name: 'Past session tag' }))
    fireEvent.click(within(screen.getByRole('listbox', { name: 'Past session tag list' })).getAllByRole('option', { name: 'Personal' })[0])
    fireEvent.click(form.getByRole('button', { name: 'Add session' }))
    expect(form.getByRole('alert')).toHaveTextContent(/duration or an end/)
    expect(timerApi.addPast).not.toHaveBeenCalled()
  })
  it("lists today's finished sessions with times and durations; Delete removes one", () => {
    const { timerApi } = renderApp(<Timer />, { tasks, sessions: [manual, done] })
    const items = within(screen.getByRole('list', { name: "Today's sessions" })).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('6:00 am–6:40 am · 40m')
    expect(items[0]).toHaveTextContent('Called Mom')
    expect(items[1]).toHaveTextContent('8:00 am–9:15 am · 1h 15m')
    fireEvent.click(screen.getByRole('button', { name: 'Delete session at 8:00 am' }))
    expect(timerApi.remove).toHaveBeenCalledWith('d1')
  })
  it('Edit opens the editor and saves a new comment and end', () => {
    const { timerApi } = renderApp(<Timer />, { tasks, sessions: [done] })
    fireEvent.click(screen.getByRole('button', { name: 'Edit session at 8:00 am' }))
    fireEvent.change(screen.getAllByLabelText('Comment').slice(-1)[0], { target: { value: 'practice joins' } })
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '2026-11-10T09:30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(timerApi.edit).toHaveBeenCalledWith('d1', { areaId: 'a-sql', taskId: null, comment: 'practice joins', start: at('2026-11-10T13:00:00Z'), end: at('2026-11-10T14:30:00Z') })
  })
  it('totals per parent tag and sub-tag, today and this week', () => {
    renderApp(<Timer />, { tasks, sessions: [done, manual] })
    const today = within(screen.getByRole('list', { name: 'Today by tag' }))
    expect(today.getAllByRole('listitem').map((li) => li.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Study1h 15mSQL1h 15m', 'Personal40m'])
    expect(within(screen.getByRole('list', { name: 'This week by tag' })).getAllByRole('listitem')).toHaveLength(2)
  })
  it('has the quick-log presets on it', () => {
    renderApp(<Timer />, { activities: [{ id: 'k', name: 'Kriya', area_id: 'a-study', default_minutes: 35, weekly_target: null, allow_multiple: false, sort: 0, archived: false }] })
    expect(screen.getByRole('group', { name: 'Activities' })).toBeInTheDocument()
  })
})
