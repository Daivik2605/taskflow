import type { Area } from '../lib/areas'

/** A tag as a colour dot + emoji + name. */
export function TagLabel({ tag, className = '' }: { tag: Pick<Area, 'name' | 'emoji' | 'color'>; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tag.color }} aria-hidden="true" />
      {tag.emoji && <span aria-hidden="true">{tag.emoji}</span>}
      <span>{tag.name}</span>
    </span>
  )
}
