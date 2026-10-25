import { useEffect, useState } from 'react'

/** The current moment, refreshed every `ms` (for "last: 2h 10m ago" style labels). */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
