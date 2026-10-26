import { useEffect, useRef } from 'react'
import { cacheGet, cacheSet } from './offlineStore'

/**
 * Keeps the last loaded data on the device so the app opens offline.
 * On mount it hands the saved copy to `hydrate` (unless the real load already finished); once `ready`, every change of `value` is saved (debounced).
 */
export function useOfflineCache<T>(name: string, value: T, ready: boolean, hydrate: (saved: T) => void, loaded: () => boolean) {
  const hydrateRef = useRef(hydrate); hydrateRef.current = hydrate
  const loadedRef = useRef(loaded); loadedRef.current = loaded
  useEffect(() => {
    let cancelled = false
    void cacheGet<T>(name).then((saved) => { if (!cancelled && saved !== undefined && !loadedRef.current()) hydrateRef.current(saved) })
    return () => { cancelled = true }
  }, [name])
  useEffect(() => {
    if (!ready) return
    const id = setTimeout(() => void cacheSet(name, value), 400)
    return () => clearTimeout(id)
  }, [name, value, ready])
}
