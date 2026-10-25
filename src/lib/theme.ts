export type Theme = 'system' | 'light' | 'dark'
const KEY = 'taskflow-theme'

export function getStoredTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function resolveDark(theme: Theme, systemDark: boolean): boolean {
  return theme === 'dark' || (theme === 'system' && systemDark)
}

export function applyTheme(theme: Theme): void {
  const systemDark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.classList.toggle('dark', resolveDark(theme, systemDark))
  try { localStorage.setItem(KEY, theme) } catch { /* private mode: theme just won't persist */ }
}
