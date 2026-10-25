import { describe, expect, it } from 'vitest'
import { activeAreas, defaultAreaId, isHexColor } from './areas'
import { area } from './fixtures'

describe('areas (tags)', () => {
  const areas = [
    area({ id: '1', name: 'Study', kind: 'study', sort: 0 }),
    area({ id: '2', name: 'Personal', sort: 6 }),
    area({ id: '3', name: 'Old', sort: 5, archived: true }),
    area({ id: '4', name: 'DSA', kind: 'study', parent_id: '1' }),
  ]
  it('quick add defaults to the top-level Personal tag', () => { expect(defaultAreaId(areas)).toBe('2') })
  it('falls back to the first active top-level tag when Personal is archived or renamed', () => {
    expect(defaultAreaId(areas.map((a) => (a.id === '2' ? { ...a, archived: true } : a)))).toBe('1')
    expect(defaultAreaId(areas.map((a) => (a.id === '2' ? { ...a, name: 'Errands' } : a)))).toBe('1')
    expect(defaultAreaId([])).toBeNull()
  })
  it('hides archived tags from pickers and orders by sort then name', () => { expect(activeAreas(areas).map((a) => a.name)).toEqual(['DSA', 'Study', 'Personal']) })
  it('checks colours', () => { expect(isHexColor('#a1B2c3')).toBe(true); expect(isHexColor('red')).toBe(false); expect(isHexColor('#abc')).toBe(false) })
})
