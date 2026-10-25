import type { Area } from '../lib/areas'

/** A tag as a colour dot + name. */
export function TagLabel({ tag, className = '' }: { tag: Pick<Area, 'name' | 'color'>; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tag.color }} aria-hidden="true" />
      <span>{tag.name}</span>
    </span>
  )
}
