// Placeholder for the pay helpers phase 6 fills in (src/lib/pay.ts). Only the "not set up yet" rule lives here for now.

export const PAY_NOT_SET_MESSAGE = 'Set your rate and pay period in Settings → Jobs'

export interface PayConfig { hourly_rate: number | null; pay_period_anchor: string | null }

/** Pay can only be shown when both the hourly rate and a pay-period start date are set. Wherever pay is shown, show PAY_NOT_SET_MESSAGE instead when this is false. */
export function payIsConfigured(job: PayConfig | null | undefined): boolean {
  return !!job && job.hourly_rate !== null && job.hourly_rate !== undefined && !!job.pay_period_anchor
}
