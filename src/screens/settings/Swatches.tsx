import { AREA_COLORS, isHexColor } from '../../lib/areas'

export function Swatches({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Colour">
      {AREA_COLORS.map((c) => (
        <button key={c} type="button" role="radio" aria-checked={value.toLowerCase() === c} aria-label={c} onClick={() => onPick(c)}
          className={`h-9 w-9 rounded-full border-2 ${value.toLowerCase() === c ? 'border-slate-900 dark:border-white' : 'border-transparent'}`} style={{ background: c }} />
      ))}
      <label className="flex h-9 items-center gap-1 text-xs text-slate-500">Custom
        <input type="color" value={isHexColor(value) ? value : '#64748b'} onChange={(e) => onPick(e.target.value)} className="h-9 w-9 rounded border-0 bg-transparent p-0" aria-label="Custom colour" />
      </label>
    </div>
  )
}
