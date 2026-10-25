import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { OUT_OF_DATE } from '../data/db'
import { supabase } from '../lib/supabase'

interface Conn {
  online: boolean
  error: string | null
  /** True when the browser is offline or Supabase can't be reached: screens must disable writes (never silently drop them). */
  writesDisabled: boolean
  reportError: (message: string) => void
  clearError: () => void
  recheck: () => void
}

const Ctx = createContext<Conn | null>(null)

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const up = () => { setOnline(true); setTick((t) => t + 1) }
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])

  const clearError = useCallback(() => setError(null), [])
  const recheck = useCallback(() => setTick((t) => t + 1), [])
  const value = useMemo<Conn>(() => ({
    online,
    error,
    writesDisabled: !online || error !== null,
    reportError: setError,
    clearError,
    recheck,
  }), [online, error, clearError, recheck])

  return (
    <Ctx.Provider value={value}>
      <HealthCheck tick={tick} />
      {children}
    </Ctx.Provider>
  )
}

export function useConnection(): Conn {
  const c = useContext(Ctx)
  if (!c) throw new Error('useConnection outside ConnectionProvider')
  return c
}

/** Every 30 s (and on reconnect / Retry) asks Supabase for one row of our own table. Only runs while signed in. */
function HealthCheck({ tick }: { tick: number }) {
  const { reportError, clearError } = useConnection()
  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let cancelled = false
    const ping = async () => {
      const { data } = await client.auth.getSession()
      if (!data.session || !navigator.onLine) return
      try {
        // The newest table: if it's missing, the SQL for this version hasn't been run yet.
        const { error } = await client.from('taskflow_counters').select('id').limit(1)
        if (cancelled) return
        if (!error) clearError()
        else if (error.code === '42P01' || error.code === 'PGRST205' || error.code === '42703') reportError(OUT_OF_DATE)
        else reportError(error.message)
      } catch (e) {
        if (!cancelled) reportError(e instanceof Error ? e.message : 'Network error')
      }
    }
    void ping()
    const id = setInterval(ping, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [tick, reportError, clearError])
  return null
}
