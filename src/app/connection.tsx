import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
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
        const { error } = await client.from('taskflow_settings').select('id').limit(1)
        if (cancelled) return
        if (!error) clearError()
        else if (error.code === '42P01' || error.code === 'PGRST205')
          reportError('TaskFlow tables not found — run supabase/taskflow_schema.sql in the Supabase SQL Editor.')
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
