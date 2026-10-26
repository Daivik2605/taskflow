import { useConnection } from './connection'

export function ConnectionBanner() {
  const { online, error, recheck } = useConnection()
  if (online && !error) return null
  return (
    <div role="alert" className="flex items-center gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
      <span className="flex-1">
        {!online
          ? "You're offline. Showing what was last loaded. Logging still works and is sent when you reconnect; settings changes wait until then."
          : `Can't reach Supabase: ${error}. Logging still works and is sent when it's back; settings changes wait until then.`}
      </span>
      <button onClick={recheck} className="min-h-9 rounded-md border border-amber-700/40 px-3 font-medium">Retry</button>
    </div>
  )
}
