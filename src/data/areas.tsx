import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useConnection } from '../app/connection'
import { useToast } from '../app/toast'
import { byAreaSort, nextAreaSort, validateAreaName, type Area } from '../lib/areas'
import type { AreaKind } from '../lib/seed'
import { db } from './db'

export interface AreasApi {
  areas: Area[] // all, including archived, in display order
  loading: boolean
  /** Resolves to an error message to show next to the form, or null on success. */
  add: (input: { name: string; kind: AreaKind; color: string }) => Promise<string | null>
  update: (id: string, patch: Partial<Pick<Area, 'name' | 'kind' | 'color' | 'archived'>>) => Promise<string | null>
  reorder: (changes: { id: string; sort: number }[]) => Promise<boolean>
}

export const AreasContext = createContext<AreasApi | null>(null)

export function useAreas(): AreasApi {
  const c = useContext(AreasContext)
  if (!c) throw new Error('useAreas outside AreasProvider')
  return c
}

const COLUMNS = 'id,name,kind,app_key,color,sort,archived'

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

  // Areas aren't in the realtime publication, so pick up changes from the other device when this tab regains focus.
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const { data, error } = await db().from('taskflow_areas').select(COLUMNS)
      if (cancelled) return
      if (error) { reportError(error.message); return }
      setAreas(() => (data ?? []) as Area[])
      setLoading(false)
    }
    void load()
    const onVisible = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible) }
  }, [setAreas, reportError])

  const offline = useCallback(() => {
    toast.show("You're offline or Supabase is unreachable — changes are turned off.")
    return 'Changes are turned off while offline.'
  }, [toast])

  const add = useCallback<AreasApi['add']>(async ({ name, kind, color }) => {
    if (writesOff.current) return offline()
    const problem = validateAreaName(name, ref.current)
    if (problem) return problem
    const { data, error } = await db().from('taskflow_areas').insert({ name: name.trim(), kind, color, sort: nextAreaSort(ref.current) }).select(COLUMNS).single()
    if (error) return error.code === '23505' ? 'An area with that name already exists.' : error.message
    setAreas((l) => [...l, data as Area])
    return null
  }, [offline, setAreas])

  const update = useCallback<AreasApi['update']>(async (id, patch) => {
    if (writesOff.current) return offline()
    const prev = ref.current.find((a) => a.id === id)
    if (!prev) return 'That area no longer exists.'
    if (patch.name !== undefined) {
      const problem = validateAreaName(patch.name, ref.current, id)
      if (problem) return problem
      patch = { ...patch, name: patch.name.trim() }
    }
    setAreas((l) => l.map((a) => (a.id === id ? { ...a, ...patch } : a)))
    const { error } = await db().from('taskflow_areas').update(patch).eq('id', id)
    if (error) {
      setAreas((l) => l.map((a) => (a.id === id ? prev : a)))
      return error.code === '23505' ? 'An area with that name already exists.' : error.message
    }
    return null
  }, [offline, setAreas])

  const reorder = useCallback<AreasApi['reorder']>(async (changes) => {
    if (changes.length === 0) return true
    if (writesOff.current) { offline(); return false }
    const prevSorts = new Map(ref.current.map((a) => [a.id, a.sort]))
    const next = new Map(changes.map((c) => [c.id, c.sort]))
    setAreas((l) => l.map((a) => (next.has(a.id) ? { ...a, sort: next.get(a.id)! } : a)))
    const results = await Promise.all(changes.map((c) => db().from('taskflow_areas').update({ sort: c.sort }).eq('id', c.id)))
    const failed = results.find((r) => r.error)
    if (failed?.error) {
      setAreas((l) => l.map((a) => (next.has(a.id) ? { ...a, sort: prevSorts.get(a.id)! } : a)))
      toast.show(`Reordering failed: ${failed.error.message}`)
      return false
    }
    return true
  }, [offline, setAreas, toast])

  const api = useMemo<AreasApi>(() => ({ areas, loading, add, update, reorder }), [areas, loading, add, update, reorder])
  return <AreasContext.Provider value={api}>{children}</AreasContext.Provider>
}
