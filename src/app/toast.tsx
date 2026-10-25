import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface ToastItem { id: number; message: string; action?: () => void; actionLabel: string; extra?: ReactNode }
interface ToastOptions { actionLabel?: string; timeoutMs?: number; /** Rendered under the message (e.g. the reason chips after a counter tap). */ extra?: ReactNode }
interface ToastApi {
  /** `action` adds a button (default label "Retry"). Without one the toast fades after 5 s; with one it stays until used or dismissed, unless `timeoutMs` is given (e.g. 5000 for Undo). */
  show: (message: string, action?: () => void, opts?: ToastOptions) => number
  dismiss: (id: number) => void
}

const Ctx = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), [])
  const show = useCallback<ToastApi['show']>((message, action, opts = {}) => {
    const id = nextId.current++
    setItems((l) => [...l.slice(-2), { id, message, action, actionLabel: opts.actionLabel ?? 'Retry', extra: opts.extra }])
    const timeout = opts.timeoutMs ?? (action ? null : 5000)
    if (timeout !== null) setTimeout(() => dismiss(id), timeout)
    return id
  }, [dismiss])

  return (
    <Ctx.Provider value={{ show, dismiss }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} role="status" className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
            <div className="min-w-0 flex-1">
              <span>{t.message}</span>
              {t.extra}
            </div>
            {t.action && <button className="min-h-9 rounded-md border border-current px-3 font-medium" onClick={() => { dismiss(t.id); t.action!() }}>{t.actionLabel}</button>}
            <button className="min-h-9 min-w-9 rounded-md" aria-label="Dismiss" onClick={() => dismiss(t.id)}>✕</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export function useToast(): ToastApi {
  const c = useContext(Ctx)
  if (!c) throw new Error('useToast outside ToastProvider')
  return c
}
