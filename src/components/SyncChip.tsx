import { useState } from 'react'
import { useOutbox } from '../data/outbox'
import { describeOp } from '../lib/syncQueue'
import { formatTime } from '../lib/time'
import { btn, btnDanger } from './ui'

/** "3 waiting to sync" in the header while writes are queued; failed ones open a list to retry or discard. */
export function SyncChip() {
  const { items, pending, failed, syncing, retry, retryAll, discard } = useOutbox()
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null
  const label = failed.length > 0 ? `${failed.length} couldn't sync` : syncing ? `Syncing ${pending}…` : `${pending} waiting to sync`
  return (
    <div className="border-b border-slate-200 px-3 py-1 dark:border-slate-800 lg:px-8">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={`min-h-9 rounded-full px-3 text-xs font-medium ${failed.length > 0 ? 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200' : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'}`}>
        {label}
      </button>
      {open && (
        <div role="group" aria-label="Waiting changes" className="mt-2 space-y-2 pb-2">
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
            {items.map((i) => (
              <li key={i.seq} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block">{describeOp(i.op)} <span className="text-xs text-slate-500">· {formatTime(i.queuedAt)}</span></span>
                  {i.status === 'failed' && <span className="block text-xs text-red-600 dark:text-red-400">Not saved: {i.error}</span>}
                  {i.status === 'pending' && i.tries > 0 && <span className="block text-xs text-slate-500">Trying again… {i.error}</span>}
                </span>
                {i.status === 'failed' && (
                  <>
                    <button type="button" className={`${btn} min-h-9 px-3`} onClick={() => retry(i.seq)} aria-label={`Retry: ${describeOp(i.op)}`}>Retry</button>
                    <button type="button" className={`${btnDanger} min-h-9 px-3`} onClick={() => discard(i.seq)} aria-label={`Discard: ${describeOp(i.op)}`}>Discard</button>
                  </>
                )}
              </li>
            ))}
          </ul>
          {failed.length > 1 && <button type="button" className={`${btn} min-h-9`} onClick={retryAll}>Retry all</button>}
        </div>
      )}
    </div>
  )
}
