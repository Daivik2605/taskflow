import { useId, useMemo, useState } from 'react'
import { useAreas } from '../data/areas'
import type { Area } from '../lib/areas'
import { getRecentTags, orderForPicker, parentOf, rememberTag } from '../lib/tags'
import { TagLabel } from './TagLabel'
import { input } from './ui'

interface Props {
  value: string | null
  onChange: (id: string | null) => void
  /** Offer "No tag" (tasks may have none; a timer session may not). */
  allowNone?: boolean
  label?: string
}

/** Grouped tag list: recent tags first, then each parent with its sub-tags indented. Picking a parent is allowed ("general"). */
export function TagPicker({ value, onChange, allowNone = false, label = 'Tag' }: Props) {
  const { areas } = useAreas()
  const [open, setOpen] = useState(false)
  const listId = useId()
  const current = areas.find((a) => a.id === value) ?? null
  const parent = parentOf(areas, value)
  // Read the recent list each time the panel opens, so a pick made elsewhere shows up.
  const { recent, groups } = useMemo(() => orderForPicker(areas, open ? getRecentTags() : []), [areas, open])

  const pick = (a: Area | null) => {
    if (a) rememberTag(a.id)
    onChange(a?.id ?? null)
    setOpen(false)
  }

  const option = (a: Area, indent = false, suffix = '') => (
    <li key={`${indent ? 's' : 'p'}-${a.id}-${suffix}`} role="none">
      <button type="button" role="option" aria-selected={a.id === value} onClick={() => pick(a)} className={`flex min-h-11 w-full items-center gap-2 px-3 text-left text-base hover:bg-slate-100 dark:hover:bg-slate-800 ${indent ? 'pl-8' : 'font-medium'} ${a.id === value ? 'bg-indigo-50 dark:bg-indigo-950' : ''}`}>
        <TagLabel tag={a} />
        {!indent && a.parent_id === null && groups.find((g) => g.tag.id === a.id)?.children.length ? <span className="text-xs font-normal text-slate-500">general</span> : null}
      </button>
    </li>
  )

  return (
    <div className="relative">
      <button type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} onClick={() => setOpen((o) => !o)}
        className={`${input} flex items-center justify-between gap-2 text-left`}>
        {current ? (
          <span className="flex min-w-0 items-center gap-2">
            <TagLabel tag={current} />
            {parent && <span className="truncate text-xs text-slate-500">in {parent.name}</span>}
          </span>
        ) : <span className="text-slate-500">No tag</span>}
        <span aria-hidden="true" className="text-slate-400">▾</span>
      </button>
      {open && (
        <ul id={listId} role="listbox" aria-label={`${label} list`} className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {allowNone && (
            <li role="none">
              <button type="button" role="option" aria-selected={value === null} onClick={() => pick(null)} className="flex min-h-11 w-full items-center px-3 text-left text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">No tag</button>
            </li>
          )}
          {recent.length > 0 && (
            <>
              <li className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500" aria-hidden="true">Recent</li>
              {recent.map((a) => option(a, false, 'recent'))}
              <li className="my-1 border-t border-slate-100 dark:border-slate-800" aria-hidden="true" />
            </>
          )}
          {groups.map((g) => (
            <ul key={g.tag.id} role="group" aria-label={g.tag.name}>
              {option(g.tag)}
              {g.children.map((c) => option(c, true))}
            </ul>
          ))}
        </ul>
      )}
    </div>
  )
}
