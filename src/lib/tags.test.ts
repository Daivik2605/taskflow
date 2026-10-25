import { beforeEach, describe, expect, it } from 'vitest'
import type { Area } from './areas'
import { area } from './fixtures'
import {
  buildTree, effectiveKind, getRecentTags, nextTagSort, orderForPicker, parentOf, pushRecent, rememberTag, siblingsOf, tagIdsFor, tagLabel, tagPath,
  validateArchive, validateMerge, validateMove, validateTagName,
} from './tags'
import { reorderWithin } from './tasks'

const tags: Area[] = [
  area({ id: 'study', name: 'Study', kind: 'study', sort: 2, emoji: '📚' }),
  area({ id: 'work', name: 'Work', kind: 'work', sort: 0 }),
  area({ id: 'dsa', name: 'DSA', kind: 'study', parent_id: 'study', sort: 0, emoji: '🧩' }),
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
    expect(tagLabel(tags[0])).toBe('📚 Study')
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
