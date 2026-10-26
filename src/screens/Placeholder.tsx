import type { ReactNode } from 'react'

export function Placeholder({ title, phase, blurb, children }: { title: string; phase: number; /** One line: what this screen will do. */ blurb: string; children?: ReactNode }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm">{blurb}</p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Coming in phase {phase}.</p>
      {children}
    </section>
  )
}
