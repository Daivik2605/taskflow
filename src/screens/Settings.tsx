import { useState } from 'react'
import { useAuth } from '../app/auth'
import { AreasSettings } from './settings/AreasSettings'
import { applyTheme, getStoredTheme, type Theme } from '../lib/theme'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' },
]

export function Settings() {
  const { session, signOut } = useAuth()
  const [theme, setTheme] = useState<Theme>(getStoredTheme)
  const pick = (t: Theme) => { setTheme(t); applyTheme(t) }

  return (
    <section className="max-w-xl space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Appearance</h2>
        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-2">
          {THEMES.map((t) => (
            <button key={t.value} role="radio" aria-checked={theme === t.value} onClick={() => pick(t.value)}
              className={`min-h-12 rounded-lg border text-sm font-medium ${theme === t.value ? 'border-indigo-600 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'border-slate-300 dark:border-slate-700'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Account</h2>
        <p className="mb-3 text-sm">{session?.user.email}</p>
        <button onClick={() => void signOut()} className="min-h-12 rounded-lg border border-slate-300 px-4 text-sm font-medium dark:border-slate-700">Sign out</button>
      </div>

      <AreasSettings />

      <p className="text-sm text-slate-500">Presets (phase 4), Actions (5) and Jobs (6) settings arrive in their phases.</p>
    </section>
  )
}
