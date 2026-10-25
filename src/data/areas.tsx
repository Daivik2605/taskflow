import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useConnection } from '../app/connection'
import { useToast } from '../app/toast'
import { byAreaSort, type Area, type TagKind } from '../lib/areas'
import { nextTagSort, validateArchive, validateMerge, validateMove, validateTagName } from '../lib/tags'
import { db, friendlyDbError } from './db'

export interface NewTag { name: string; parent_id: string | null; kind: TagKind; color: string; emoji: string | null }
export type TagPatch = Partial<Pick<Area, 'name' | 'kind' | 'color' | 'emoji' | 'archived' | 'parent_id'>>

export interface AreasApi {
  areas: Area[] // every tag, including archived, in display order (parents and sub-tags together)
  loading: boolean
  /** Each resolves to a message to show next to the form, or null on success. */
  add: (input: NewTag) => Promise<string | null>
  update: (id: string, patch: TagPatch) => Promise<string | null>
  reorder: (changes: { id: string; sort: number }[]) => Promise<boolean>
  /** Moves everything on tag `from` to tag `into`, then archives `from` (one atomic database call). */
  merge: (from: string, into: string) => Promise<string | null>
}

export const AreasContext = createContext<AreasApi | null>(null)

/** The tags (called areas in the code). */
export function useAreas(): AreasApi {
  const c = useContext(AreasContext)
  if (!c) throw new Error('useAreas outside AreasProvider')
  return c
}

const COLUMNS = 'id,name,kind,app_key,color,emoji,sort,archived,parent_id'
const message = (error: { code?: string; message: string }) => (error.code === '23505' ? 'A tag with that name already exists there.' : friendlyDbError(error))

export function AreasProvider({ children }: { children: ReactNode }) {
  const { writesDisabled, reportError } = useConnection()
  const toast = useToast()
  const [areas, setAreasState] = useState<Area[]>([])
  const [loading, setLoading] = useState(true)
  const ref = useRef<Area[]>([])
  const setAreas = useCallback((fn: (prev: Area[]) => Area[]) => {
    ref.current = fn(ref.current).sort(byAreaSort)
    setAreasState(ref.current)
  }, [])
  const writesOff = useRef(writesDisabled)
  writesOff.current = writesDisabled

  const load = useCallback(async () => {
    const { data, error } = await db().from('taskflow_areas').select(COLUMNS)
    if (error) { reportError(friendlyDbError(error)); return }
    setAreas(() => (data ?? []) as Area[])
    setLoading(false)
  }, [setAreas, reportError])

  // Tags aren't in the realtime publication, so pick up changes from the other device when this tab regains focus.
  useEffect(() => {
    void load()
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const offline = useCallback(() => {
    toast.show("You're offline or Supabase is unreachable — changes are turned off.")
    return 'Changes are turned off while offline.'
  }, [toast])

  const add = useCallback<AreasApi['add']>(async (input) => {
    if (writesOff.current) return offline()
    const problem = validateTagName(input.name, ref.current, input.parent_id)
    if (problem) return problem
    const parent = input.parent_id ? ref.current.find((a) => a.id === input.parent_id) : null
    if (input.parent_id && !parent) return 'That parent no longer exists.'
    if (parent && parent.parent_id) return 'Tags have two levels: pick a top-level tag as the parent.'
    const { data, error } = await db().from('taskflow_areas')
      .insert({ name: input.name.trim(), parent_id: input.parent_id, kind: parent ? parent.kind : input.kind, color: input.color, emoji: input.emoji || null, sort: nextTagSort(ref.current, input.parent_id) })
      .select(COLUMNS).single()
    if (error) return message(error)
    setAreas((l) => [...l, data as Area])
    return null
  }, [offline, setAreas])

  const update = useCallback<AreasApi['update']>(async (id, patch) => {
    if (writesOff.current) return offline()
    const prev = ref.current.find((a) => a.id === id)
    if (!prev) return 'That tag no longer exists.'
    let body = { ...patch }
    if (body.name !== undefined) {
      const problem = validateTagName(body.name, ref.current, body.parent_id !== undefined ? body.parent_id : prev.parent_id, id)
      if (problem) return problem
      body = { ...body, name: body.name.trim() }
    }
    if (body.parent_id !== undefined && body.parent_id !== prev.parent_id) {
      const problem = validateMove(ref.current, id, body.parent_id)
      if (problem) return problem
    }
    if (body.archived === true && !prev.archived) {
      const problem = validateArchive(ref.current, id)
      if (problem) return problem
    }
    if (body.emoji !== undefined) body = { ...body, emoji: body.emoji || null }
    // Optimistic. A parent's kind flows down to its sub-tags, and a moved sub-tag takes its new parent's kind (the database does the same).
    const newParent = body.parent_id !== undefined && body.parent_id ? ref.current.find((a) => a.id === body.parent_id) : null
    const before = ref.current
    setAreas((l) => l.map((a) => {
      if (a.id === id) return { ...a, ...body, ...(newParent ? { kind: newParent.kind } : {}) }
      if (a.parent_id === id && body.kind) return { ...a, kind: body.kind }
      return a
    }))
    const { error } = await db().from('taskflow_areas').update(body).eq('id', id)
    if (error) { setAreas(() => before); return message(error) }
    return null
  }, [offline, setAreas])

  const reorder = useCallback<AreasApi['reorder']>(async (changes) => {
    if (changes.length === 0) return true
    if (writesOff.current) { offline(); return false }
    const before = ref.current
    const next = new Map(changes.map((c) => [c.id, c.sort]))
    setAreas((l) => l.map((a) => (next.has(a.id) ? { ...a, sort: next.get(a.id)! } : a)))
    const results = await Promise.all(changes.map((c) => db().from('taskflow_areas').update({ sort: c.sort }).eq('id', c.id)))
    const failed = results.find((r) => r.error)
    if (failed?.error) {
      setAreas(() => before)
      toast.show(`Reordering failed: ${friendlyDbError(failed.error)}`)
      return false
    }
    return true
  }, [offline, setAreas, toast])

  const merge = useCallback<AreasApi['merge']>(async (from, into) => {
    if (writesOff.current) return offline()
    const problem = validateMerge(ref.current, from, into)
    if (problem) return problem
    const { error } = await db().rpc('taskflow_merge_tag', { p_from: from, p_into: into })
    if (error) return friendlyDbError(error)
    await load()
    return null
  }, [offline, load])

  const api = useMemo<AreasApi>(() => ({ areas, loading, add, update, reorder, merge }), [areas, loading, add, update, reorder, merge])
  return <AreasContext.Provider value={api}>{children}</AreasContext.Provider>
}
