import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { runSeed, supabaseSeedDb } from '../lib/seedRunner'

type SeedState = { status: 'idle' | 'seeding' | 'done' } | { status: 'error'; message: string }

interface Auth {
  session: Session | null
  loading: boolean
  seed: SeedState
  retrySeed: () => void
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const Ctx = createContext<Auth | null>(null)

// One in-flight seed per user in this tab, so StrictMode's double effect doesn't race itself.
const inflight = new Map<string, Promise<boolean>>()

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [seed, setSeed] = useState<SeedState>({ status: 'idle' })
  const [seedTick, setSeedTick] = useState(0)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!supabase || !userId) { setSeed({ status: 'idle' }); return }
    const client = supabase
    let cancelled = false
    setSeed({ status: 'seeding' })
    let p = inflight.get(userId)
    if (!p) {
      p = runSeed(supabaseSeedDb(client, userId)).finally(() => inflight.delete(userId))
      inflight.set(userId, p)
    }
    p.then(
      () => { if (!cancelled) setSeed({ status: 'done' }) },
      (e: unknown) => { if (!cancelled) setSeed({ status: 'error', message: e instanceof Error ? e.message : 'Setup failed' }) },
    )
    return () => { cancelled = true }
  }, [userId, seedTick])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return 'Supabase is not configured.'
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? error.message : null
  }, [])
  const signOut = useCallback(async () => { await supabase?.auth.signOut() }, [])
  const retrySeed = useCallback(() => setSeedTick((t) => t + 1), [])

  return <Ctx.Provider value={{ session, loading, seed, retrySeed, signIn, signOut }}>{children}</Ctx.Provider>
}

export function useAuth(): Auth {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside AuthProvider')
  return c
}
