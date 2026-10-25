import { useEffect, useState } from 'react'
import { addDays, todayToronto, torontoMidnight, type Day } from '../lib/time'

/** Today's Toronto date. Updates itself at the next Toronto midnight and whenever the tab becomes visible again. */
export function useToday(): Day {
  const [today, setToday] = useState<Day>(() => todayToronto())
  useEffect(() => {
    const refresh = () => setToday(todayToronto())
    const untilMidnight = torontoMidnight(addDays(today, 1)).getTime() - Date.now() + 1000
    const timer = setTimeout(refresh, Math.max(1000, untilMidnight))
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [today])
  return today
}
