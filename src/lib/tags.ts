// The two-level tag tree (SPEC §2b): parent → sub-tag, a sub-tag has its parent's kind, a parent includes its sub-tags
// for filters and totals. These rules mirror the database triggers so the UI can explain a refusal before asking.

import { byAreaSort, type Area, type TagKind } from './areas'

export interface TagNode { tag: Area; children: Area[] }

export const tagLabel = (a: Pick<Area, 'name'>) => a.name

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

/**
 * The tags a task may be given (SPEC §2b revision 4): only tags flagged `show_for_tasks`. A flagged sub-tag is listed under its
 * parent, which appears as a heading but is only selectable if flagged itself. `keepId` is the task's current tag: it stays
 * visible even if it isn't flagged, so an old task never shows a blank tag.
 */
export function taskTagTree(areas: Area[], keepId: string | null = null): TagNode[] {
  const offered = (a: Area) => !a.archived && (a.show_for_tasks || a.id === keepId)
  return buildTree(areas)
    .map((n) => ({ tag: n.tag, children: n.children.filter(offered) }))
    .filter((n) => offered(n.tag) || n.children.length > 0)
}

/** Recent tags first (only ones that still exist, aren't archived and pass `allowed`), then the tree. */
export function orderForPicker(areas: Area[], recentIds: string[], opts: { tasksOnly?: boolean; keepId?: string | null } = {}): { recent: Area[]; groups: TagNode[] } {
  const groups = opts.tasksOnly ? taskTagTree(areas, opts.keepId ?? null) : buildTree(areas)
  const allowed = new Set(groups.flatMap((g) => [g.tag, ...g.children]).map((a) => a.id))
  const recent = recentIds
    .map((id) => areas.find((a) => a.id === id))
    .filter((a): a is Area => !!a && !a.archived && (!opts.tasksOnly || (allowed.has(a.id) && (a.show_for_tasks || a.id === opts.keepId))))
    .slice(0, RECENT_MAX)
  return { recent, groups }
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

const KIND_PURPOSE: Record<string, string> = {
  work: 'Paid work and commute; time here feeds your shifts and pay.',
  hustle: 'Side projects; counts as productive time.',
  study: 'Learning; counts as productive time.',
  wellness: 'Health and body: Kriya, workouts, Gym.',
  break: 'Rest and downtime; not productive time.',
  sleep: 'Sleep, logged from the check-in.',
  personal: 'Everything else in life.',
}

/** One line for Settings → Tags: what this tag is used for. */
export function tagPurpose(tag: Pick<Area, 'kind' | 'app_key'>): string {
  const base = KIND_PURPOSE[tag.kind] ?? 'Time and tasks you put under this tag.'
  return tag.app_key ? `${base} Time from ${tag.app_key} lands here.` : base
}
