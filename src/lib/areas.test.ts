import { describe, expect, it } from 'vitest'
import { activeAreas, isHexColor } from './areas'
import { area } from './fixtures'

describe('areas (tags)', () => {
  const areas = [
    area({ id: '1', name: 'Study', kind: 'study', sort: 0 }),
    area({ id: '2', name: 'Personal', sort: 6 }),
    area({ id: '3', name: 'Old', sort: 5, archived: true }),
    area({ id: '4', name: 'DSA', kind: 'study', parent_id: '1' }),
  ]
  it('hides archived tags from pickers and orders by sort then name', () => { expect(activeAreas(areas).map((a) => a.name)).toEqual(['DSA', 'Study', 'Personal']) })
  it('checks colours', () => { expect(isHexColor('#a1B2c3')).toBe(true); expect(isHexColor('red')).toBe(false); expect(isHexColor('#abc')).toBe(false) })
})
