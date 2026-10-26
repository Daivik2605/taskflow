import { describe, expect, it } from 'vitest'
import { apiBaseUrl, generateToken, hashToken, isTokenName, tokenPrefix } from './apiToken'

describe('api tokens', () => {
  it('makes a long random token with the tfk_ prefix, different each time', () => {
    const a = generateToken(), b = generateToken()
    expect(a).toMatch(/^tfk_[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(b)
  })
  it('maps random bytes to url-safe characters only', () => {
    expect(generateToken(() => new Uint8Array(43).fill(255))).toBe(`tfk_${'-'.repeat(43)}`)
    expect(generateToken(() => new Uint8Array(43).fill(0))).toBe(`tfk_${'A'.repeat(43)}`)
  })
  it('hashes with sha-256 hex, the same as the Edge Function', async () => {
    expect(await hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await hashToken('abc')).toMatch(/^[0-9a-f]{64}$/)
  })
  it('shows only the start of a token', () => { expect(tokenPrefix('tfk_Ab12cdEFgh')).toBe('tfk_Ab12…') })
  it('validates names', () => { expect(isTokenName('iPhone')).toBe(true); expect(isTokenName('  ')).toBe(false); expect(isTokenName('x'.repeat(61))).toBe(false) })
  it('builds the function address', () => {
    expect(apiBaseUrl('https://abc.supabase.co/')).toBe('https://abc.supabase.co/functions/v1/taskflow-api')
    expect(apiBaseUrl(undefined)).toBeNull()
  })
})
