// "Area" is the old name for what the UI calls a **tag** (SPEC revision 2). The table stays `taskflow_areas` and the
// column `area_id`; everything the user sees says Tag. The tree rules live in tags.ts.

export type TagKind = 'work' | 'hustle' | 'study' | 'wellness' | 'break' | 'sleep' | 'personal'

export interface Area {
  id: string
  name: string
  kind: TagKind
  app_key: string | null
  color: string
  emoji: string | null
  sort: number
  archived: boolean
  parent_id: string | null
}

export const TAG_KINDS: { value: TagKind; label: string; hint: string }[] = [
  { value: 'work', label: 'Work', hint: 'paid work and commute' },
  { value: 'hustle', label: 'Hustle', hint: 'counts as productive time' },
  { value: 'study', label: 'Study', hint: 'counts as productive time' },
  { value: 'wellness', label: 'Wellness', hint: '' },
  { value: 'break', label: 'Break', hint: '' },
  { value: 'sleep', label: 'Sleep', hint: '' },
  { value: 'personal', label: 'Personal', hint: '' },
]

export const AREA_COLORS = ['#6366f1', '#3b82f6', '#0ea5e9', '#14b8a6', '#10b981', '#22c55e', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#8b5cf6', '#64748b']

export const DEFAULT_QUICK_ADD_TAG = 'Personal'

export const byAreaSort = (a: Area, b: Area) => a.sort - b.sort || a.name.localeCompare(b.name)
export const activeAreas = (areas: Area[]) => areas.filter((a) => !a.archived).sort(byAreaSort)

/** Quick add defaults to the Personal tag; falls back to the first active top-level tag if it was renamed or archived. */
export function defaultAreaId(areas: Area[]): string | null {
  const tops = activeAreas(areas).filter((a) => a.parent_id === null)
  return (tops.find((a) => a.name === DEFAULT_QUICK_ADD_TAG) ?? tops[0])?.id ?? null
}

export const isHexColor = (c: string) => /^#[0-9a-fA-F]{6}$/.test(c)
