import { describe, expect, it } from 'vitest'
import { PAY_NOT_SET_MESSAGE, payIsConfigured } from './pay'

describe('payIsConfigured', () => {
  it('is false while the rate or the anchor is null (as seeded)', () => {
    expect(payIsConfigured({ hourly_rate: null, pay_period_anchor: null })).toBe(false)
    expect(payIsConfigured({ hourly_rate: 17.6, pay_period_anchor: null })).toBe(false)
    expect(payIsConfigured({ hourly_rate: null, pay_period_anchor: '2026-10-12' })).toBe(false)
    expect(payIsConfigured(null)).toBe(false)
  })
  it('is true once both are set (a rate of 0 is still a rate)', () => {
    expect(payIsConfigured({ hourly_rate: 17.6, pay_period_anchor: '2026-10-12' })).toBe(true)
    expect(payIsConfigured({ hourly_rate: 0, pay_period_anchor: '2026-10-12' })).toBe(true)
  })
  it('uses the agreed wording', () => {
    expect(PAY_NOT_SET_MESSAGE).toBe('Set your rate and pay period in Settings → Jobs')
  })
})
