import { useRegisterSW } from 'virtual:pwa-register/react'

const HOUR = 60 * 60 * 1000

/** A new deploy waits here until you tap Reload, so an update never swaps the page out from under an edit. */
export function UpdateBanner() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    // An installed app can stay open for days: look for a new version every hour.
    onRegisteredSW(_url, registration) { if (registration) setInterval(() => { void registration.update() }, HOUR) },
  })
  if (!needRefresh) return null
  return (
    <div role="status" className="flex items-center gap-3 bg-indigo-100 px-4 py-2 text-sm text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-100">
      <span className="flex-1">A new version of TaskFlow is ready.</span>
      <button onClick={() => void updateServiceWorker(true)} className="min-h-9 rounded-md border border-indigo-700/40 px-3 font-medium">Reload</button>
      <button onClick={() => setNeedRefresh(false)} aria-label="Dismiss" className="min-h-9 min-w-9 rounded-md">✕</button>
    </div>
  )
}
