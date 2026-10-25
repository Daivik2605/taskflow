// The two-level tag tree (SPEC §2b): parent → sub-tag, a sub-tag has its parent's kind, a parent includes its sub-tags
// for filters and totals. These rules mirror the database triggers so the UI can explain a refusal before asking.

import { byAreaSort, type Area, type TagKind } from './areas'

export interface TagNode { tag: Area; children: Area[] }

export const tagLabel = (a: Pick<Area, 'name' | 'emoji'>) => (a.emoji ? `${a.emoji} ${a.name}` : a.name)

export function buildTree(areas: Area[], opts: { includeArchived?: boolean } = {}): TagNode[] {
  const keep = (a: Area) => opts.includeArchived || !a.archived
  return areas
    .filter((a) => a.parent_id === null && keep(a))
    .sort(byAreaSort)
    .map((tag) => ({ tag, children: areas.filter((c) => c.parent_id === tag.id && keep(c)).sort(byAreaSort) }))
}

/** `Study › DSA`, or `Personal` for a parent. */
export function tagPath(areas: Area[], id: string | null | undefined): string {
  const a = areas.find((x) => x.id === id)
  if (!a) return ''
  const p = a.parent_id ? areas.find((x) => x.id === a.parent_id) : null
  return p ? `${p.name} › ${a.name}` : a.name
}

/** A tag and, if it's a parent, all its sub-tags — what a tag filter or a total means by "this tag". */
export function tagIdsFor(areas: Area[], id: string): Set<string> {
  const ids = new Set([id])
  for (const a of areas) if (a.parent_id === id) ids.add(a.id)
  return ids
}

export const parentOf = (areas: Area[], id: string | null | undefined): Area | null => {
  const a = areas.find((x) => x.id === id)
  return (a?.parent_id && areas.find((x) => x.id === a.parent_id)) || null
}

/** The kind a tag really has: a sub-tag always takes its parent's. */
export function effectiveKind(areas: Area[], parentId: string | null, kind: TagKind): TagKind {
  const p = parentId ? areas.find((a) => a.id === parentId) : null
  return p ? p.kind : kind
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

/** Names are unique among siblings (archived ones count: the database key does too). Returns a message or null. */
export function validateTagName(name: string, areas: Area[], parentId: string | null, ignoreId?: string): string | null {
  if (!name.trim()) return 'Give the tag a name.'
  if (areas.some((a) => a.id !== ignoreId && a.parent_id === parentId && sameName(a.name, name)))
    return parentId ? 'That parent already has a sub-tag with this name.' : 'A tag with that name already exists.'
  return null
}

export function validateMove(areas: Area[], id: string, newParentId: string | null): string | null {
  const a = areas.find((x) => x.id === id)
  if (!a) return 'That tag no longer exists.'
  if (newParentId === id) return 'A tag cannot be its own parent.'
  if (newParentId !== null) {
    const p = areas.find((x) => x.id === newParentId)
    if (!p) return 'That parent no longer exists.'
    if (p.parent_id !== null) return 'Tags have two levels: pick a top-level tag as the parent.'
    if (areas.some((c) => c.parent_id === id)) return 'A tag that has sub-tags can’t become a sub-tag. Move or merge its sub-tags first.'
  }
  return validateTagName(a.name, areas, newParentId, id)
}

export function validateArchive(areas: Area[], id: string): string | null {
  if (areas.some((c) => c.parent_id === id && !c.archived)) return 'Archive or move its sub-tags first.'
  return null
}

export function validateMerge(areas: Area[], from: string, into: string): string | null {
  if (from === into) return 'Pick a different tag to merge into.'
  const f = areas.find((a) => a.id === from)
  const t = areas.find((a) => a.id === into)
  if (!f || !t) return 'That tag no longer exists.'
  if (t.archived) return 'You can’t merge into an archived tag.'
  if (areas.some((c) => c.parent_id === from && !c.archived)) return 'Move or archive its sub-tags first.'
  return null
}

export const siblingsOf = (areas: Area[], parentId: string | null) =>
  areas.filter((a) => a.parent_id === parentId && !a.archived).sort(byAreaSort)

export const nextTagSort = (areas: Area[], parentId: string | null) =>
  areas.filter((a) => a.parent_id === parentId).reduce((m, a) => Math.max(m, a.sort), -1) + 1

// ───────────── Picker ─────────────
export const RECENT_MAX = 5

/** Moves `id` to the front of a most-recent-first list. */
export function pushRecent(list: string[], id: string, max = 8): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max)
}

/** Recent tags first (only ones that still exist and aren't archived), then the tree. */
export function orderForPicker(areas: Area[], recentIds: string[]): { recent: Area[]; groups: TagNode[] } {
  const recent = recentIds
    .map((id) => areas.find((a) => a.id === id))
    .filter((a): a is Area => !!a && !a.archived)
    .slice(0, RECENT_MAX)
  return { recent, groups: buildTree(areas) }
}

const KEY = 'taskflow-recent-tags'
export function getRecentTags(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}
export function rememberTag(id: string): void {
  try { localStorage.setItem(KEY, JSON.stringify(pushRecent(getRecentTags(), id))) } catch { /* private mode */ }
}
