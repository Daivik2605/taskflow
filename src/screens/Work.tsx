import { useEffect, useState } from 'react'
import { PAY_NOT_SET_MESSAGE, payIsConfigured, type PayConfig } from '../lib/pay'
import { supabase } from '../lib/supabase'
import { Placeholder } from './Placeholder'

export function Work() {
  const [job, setJob] = useState<PayConfig | null | undefined>(undefined)
  useEffect(() => {
    void supabase?.from('taskflow_jobs').select('hourly_rate,pay_period_anchor').limit(1).maybeSingle()
      .then(({ data }) => setJob(data as PayConfig | null))
  }, [])
  return (
    <Placeholder title="Work" phase={6} blurb="Shifts, pay rules, pay periods and paystub checks.">
      {job !== undefined && !payIsConfigured(job) && (
        <p className="mt-4 rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">{PAY_NOT_SET_MESSAGE}</p>
      )}
    </Placeholder>
  )
}
