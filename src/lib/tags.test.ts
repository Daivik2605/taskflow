import { beforeEach, describe, expect, it } from 'vitest'
import type { Area } from './areas'
import { area } from './fixtures'
import {
  buildTree, effectiveKind, getRecentTags, nextTagSort, orderForPicker, parentOf, pushRecent, rememberTag, siblingsOf, tagIdsFor, tagLabel, tagPath,
  validateArchive, validateMerge, validateMove, validateTagName,
} from './tags'
import { reorderWithin } from './tasks'
import { taskTagTree } from './tags'

const tags: Area[] = [
  area({ id: 'study', name: 'Study', kind: 'study', sort: 2 }),
  area({ id: 'work', name: 'Work', kind: 'work', sort: 0 }),
  area({ id: 'dsa', name: 'DSA', kind: 'study', parent_id: 'study', sort: 0 }),
  area({ id: 'sql', name: 'SQL', kind: 'study', parent_id: 'study', sort: 1 }),
  area({ id: 'old', name: 'Old', kind: 'study', parent_id: 'study', sort: 2, archived: true }),
  area({ id: 'tim', name: 'Tim Hortons', kind: 'work', parent_id: 'work', sort: 0 }),
  area({ id: 'brk', name: 'Break', kind: 'break', sort: 4 }),
  area({ id: 'gone', name: 'Archived parent', kind: 'break', sort: 9, archived: true }),
]

describe('tag tree', () => {
  it('builds parents in order with their sub-tags, hiding archived ones by default', () => {
    expect(buildTree(tags).map((n) => [n.tag.name, n.children.map((c) => c.name)])).toEqual([
      ['Work', ['Tim Hortons']], ['Study', ['DSA', 'SQL']], ['Break', []]])
    expect(buildTree(tags, { includeArchived: true }).map((n) => n.tag.name)).toEqual(['Work', 'Study', 'Break', 'Archived parent'])
    expect(buildTree(tags, { includeArchived: true }).find((n) => n.tag.id === 'study')!.children).toHaveLength(3)
  })
  it('labels and paths', () => {
    expect(tagLabel(tags[0])).toBe('Study')
    expect(tagLabel(tags[1])).toBe('Work')
    expect(tagPath(tags, 'dsa')).toBe('Study › DSA')
    expect(tagPath(tags, 'study')).toBe('Study')
    expect(tagPath(tags, 'nope')).toBe('')
    expect(parentOf(tags, 'dsa')?.id).toBe('study')
    expect(parentOf(tags, 'study')).toBeNull()
  })
  it('a parent includes its sub-tags for filters and totals; a sub-tag is just itself', () => {
    expect([...tagIdsFor(tags, 'study')].sort()).toEqual(['dsa', 'old', 'sql', 'study'])
    expect([...tagIdsFor(tags, 'dsa')]).toEqual(['dsa'])
  })
  it('a sub-tag takes its parent kind', () => {
    expect(effectiveKind(tags, 'study', 'break')).toBe('study')
    expect(effectiveKind(tags, null, 'break')).toBe('break')
  })
  it('orders siblings and picks the next sort', () => {
    expect(siblingsOf(tags, 'study').map((t) => t.id)).toEqual(['dsa', 'sql'])
    expect(siblingsOf(tags, null).map((t) => t.id)).toEqual(['work', 'study', 'brk'])
    expect(nextTagSort(tags, 'study')).toBe(3) // counts the archived one so a restore never collides
    expect(nextTagSort(tags, 'brk')).toBe(0)
  })
  it('reorders within siblings', () => {
    expect(reorderWithin(siblingsOf(tags, 'study'), 'sql', 'up')).toEqual([{ id: 'sql', sort: 0 }, { id: 'dsa', sort: 1 }])
  })
})

describe('tag rules', () => {
  it('names must be unique among siblings, ignoring case, archived included', () => {
    expect(validateTagName(' ', tags, null)).toMatch(/name/)
    expect(validateTagName('study', tags, null)).toMatch(/already exists/)
    expect(validateTagName('dsa', tags, 'study')).toMatch(/already has a sub-tag/)
    expect(validateTagName('old', tags, 'study')).toMatch(/already has a sub-tag/)
    expect(validateTagName('DSA', tags, 'study', 'dsa')).toBeNull() // renaming to itself
    expect(validateTagName('DSA', tags, 'work')).toBeNull() // same name under another parent is fine
    expect(validateTagName('Gym', tags, null)).toBeNull()
  })
  it('moving: two levels only, no parent with sub-tags, no name clash', () => {
    expect(validateMove(tags, 'dsa', 'work')).toBeNull()
    expect(validateMove(tags, 'dsa', null)).toBeNull() // promote to a parent
    expect(validateMove(tags, 'dsa', 'dsa')).toMatch(/own parent/)
    expect(validateMove(tags, 'dsa', 'tim')).toMatch(/two levels/)
    expect(validateMove(tags, 'study', 'work')).toMatch(/sub-tags/)
    expect(validateMove(tags, 'brk', 'work')).toBeNull() // a childless parent can become a sub-tag
    expect(validateMove([...tags, area({ id: 'dsa2', name: 'DSA', parent_id: 'work', kind: 'work' })], 'dsa', 'work')).toMatch(/already has/)
    expect(validateMove(tags, 'nope', 'work')).toMatch(/no longer exists/)
  })
  it('archiving a parent needs its sub-tags archived or moved first', () => {
    expect(validateArchive(tags, 'study')).toMatch(/sub-tags first/)
    expect(validateArchive(tags, 'dsa')).toBeNull()
    expect(validateArchive(tags, 'brk')).toBeNull()
    expect(validateArchive(tags.map((t) => (t.parent_id === 'study' ? { ...t, archived: true } : t)), 'study')).toBeNull()
  })
  it('merging: not into itself or an archived tag, and not a parent that still has sub-tags', () => {
    expect(validateMerge(tags, 'dsa', 'sql')).toBeNull()
    expect(validateMerge(tags, 'dsa', 'work')).toBeNull() // across parents is allowed
    expect(validateMerge(tags, 'dsa', 'dsa')).toMatch(/different/)
    expect(validateMerge(tags, 'dsa', 'old')).toMatch(/archived/)
    expect(validateMerge(tags, 'study', 'brk')).toMatch(/sub-tags first/)
    expect(validateMerge(tags, 'brk', 'study')).toBeNull()
  })
})

describe('picker', () => {
  beforeEach(() => localStorage.clear())
  it('keeps recent tags first, most recent first, without duplicates', () => {
    expect(pushRecent(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b'])
    expect(pushRecent(['a'], 'z', 3)).toEqual(['z', 'a'])
    expect(pushRecent(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b'])
  })
  it('lists recent tags that still exist and are not archived, then the tree', () => {
    const { recent, groups } = orderForPicker(tags, ['sql', 'old', 'ghost', 'tim'])
    expect(recent.map((t) => t.id)).toEqual(['sql', 'tim'])
    expect(groups.map((g) => g.tag.name)).toEqual(['Work', 'Study', 'Break'])
  })
  it('remembers picks on this device', () => {
    rememberTag('dsa'); rememberTag('sql'); rememberTag('dsa')
    expect(getRecentTags()).toEqual(['dsa', 'sql'])
  })
})

describe('task tag shortlist (SPEC §2b revision 4)', () => {
  const list: Area[] = [
    area({ id: 'study', name: 'Study', kind: 'study', sort: 0, show_for_tasks: true }),
    area({ id: 'dsa', name: 'DSA', kind: 'study', parent_id: 'study', sort: 0 }),
    area({ id: 'trading', name: 'Trading', kind: 'study', parent_id: 'study', sort: 1, show_for_tasks: true }),
    area({ id: 'work', name: 'Work', kind: 'work', sort: 1 }),
    area({ id: 'oland', name: 'Oland Stations', kind: 'work', parent_id: 'work', sort: 0, show_for_tasks: true }),
    area({ id: 'tim', name: 'Tim Hortons', kind: 'work', parent_id: 'work', sort: 1 }),
    area({ id: 'personal', name: 'Personal', kind: 'personal', sort: 2 }),
    area({ id: 'gone', name: 'Gone', kind: 'work', parent_id: 'work', sort: 2, show_for_tasks: true, archived: true }),
  ]
  const names = (id: string | null = null) => taskTagTree(list, id).map((n) => [n.tag.name, n.children.map((c) => c.name)])
  it('offers only flagged tags; a parent shows when it or a sub-tag is flagged', () => {
    expect(names()).toEqual([['Study', ['Trading']], ['Work', ['Oland Stations']]])
  })
  it('never offers archived tags', () => { expect(names().flat(2)).not.toContain('Gone') })
  it('keeps the task\'s current tag visible even if it is not flagged', () => {
    expect(names('personal')).toContainEqual(['Personal', []])
    expect(names('tim')).toContainEqual(['Work', ['Oland Stations', 'Tim Hortons']])
  })
  it('limits the recent list to offered tags', () => {
    const { recent, groups } = orderForPicker(list, ['dsa', 'trading', 'personal', 'oland'], { tasksOnly: true })
    expect(recent.map((t) => t.id)).toEqual(['trading', 'oland'])
    expect(groups).toHaveLength(2)
  })
  it('the full tree is untouched when tasksOnly is off (timer, activities, Insights)', () => {
    expect(orderForPicker(list, []).groups.map((g) => g.tag.name)).toEqual(['Study', 'Work', 'Personal'])
    expect(orderForPicker(list, []).groups[0].children.map((c) => c.name)).toEqual(['DSA', 'Trading'])
  })
})
