import { beforeEach, describe, expect, it } from 'vitest'
import { applyTheme, getStoredTheme, resolveDark } from './theme'

describe('theme', () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.classList.remove('dark') })
  it('resolves system / light / dark', () => {
    expect(resolveDark('system', true)).toBe(true)
    expect(resolveDark('system', false)).toBe(false)
    expect(resolveDark('light', true)).toBe(false)
    expect(resolveDark('dark', false)).toBe(true)
  })
  it('stores and applies an override', () => {
    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(getStoredTheme()).toBe('dark')
    applyTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
  it('defaults to system', () => { expect(getStoredTheme()).toBe('system') })
})
