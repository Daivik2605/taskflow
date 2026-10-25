// All "day" logic for TaskFlow. A day is an America/Toronto calendar date (`YYYY-MM-DD`);
// a moment is a Date/ISO string. Never use the browser's local date anywhere else.

export const TZ = 'America/Toronto'

export type Day = string // YYYY-MM-DD
export type Instant = Date | string | number

export interface DaySegment {
  day: Day
  start: Date
  end: Date
  minutes: number
}

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

const partsFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function toDate(i: Instant): Date {
  const d = i instanceof Date ? i : new Date(i)
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid instant: ${String(i)}`)
  return d
}

function torontoParts(d: Date) {
  const p: Record<string, number> = {}
  for (const { type, value } of partsFormat.formatToParts(d)) {
    if (type !== 'literal') p[type] = Number(value)
  }
  return p as { year: number; month: number; day: number; hour: number; minute: number; second: number }
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** The Toronto calendar date of a moment. */
export function dayOf(instant: Instant): Day {
  const p = torontoParts(toDate(instant))
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`
}

/** Today's Toronto date. `now` is injectable for tests. */
export function todayToronto(now: Instant = new Date()): Day {
  return dayOf(now)
}

export function isDay(s: string): boolean {
  const m = DAY_RE.exec(s)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const t = new Date(Date.UTC(y, mo - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d
}

function parseDay(day: Day): [number, number, number] {
  if (!isDay(day)) throw new Error(`Invalid day: ${day}`)
  const m = DAY_RE.exec(day)!
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** Calendar arithmetic on a date string (no time zone involved). */
export function addDays(day: Day, n: number): Day {
  const [y, m, d] = parseDay(day)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** Whole days from a to b (b - a). */
export function diffDays(a: Day, b: Day): number {
  const [ay, am, ad] = parseDay(a)
  const [by, bm, bd] = parseDay(b)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

/** Offset of Toronto from UTC at an instant, in ms (negative: Toronto is behind UTC). */
function offsetMs(d: Date): number {
  const p = torontoParts(d)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(d.getTime() / 1000) * 1000
}

/** The instant a Toronto day starts (00:00 local). Toronto switches at 02:00, so midnight always exists once. */
export function torontoMidnight(day: Day): Date {
  const [y, m, d] = parseDay(day)
  const guess = Date.UTC(y, m - 1, d)
  let t = guess - offsetMs(new Date(guess))
  t = guess - offsetMs(new Date(t)) // re-check at the candidate, in case the offset differs there
  return new Date(t)
}

/** Split [start, end) at Toronto midnights. DST days come out as 23 h / 25 h. Zero-length gives []. */
export function splitByDay(start: Instant, end: Instant): DaySegment[] {
  const s = toDate(start)
  const e = toDate(end)
  if (e < s) throw new Error('Interval ends before it starts')
  const out: DaySegment[] = []
  let cur = s
  while (cur < e) {
    const day = dayOf(cur)
    const nextMidnight = torontoMidnight(addDays(day, 1))
    const segEnd = nextMidnight < e ? nextMidnight : e
    out.push({ day, start: cur, end: segEnd, minutes: (segEnd.getTime() - cur.getTime()) / 60_000 })
    cur = segEnd
  }
  return out
}

/** `1h 05m`, `45m`, `0m`. Rounds to the nearest whole minute; negatives clamp to 0. */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes))
  const h = Math.floor(total / 60)
  const m = total % 60
  return h > 0 ? `${h}h ${pad(m)}m` : `${m}m`
}

/** Day of week for a date string, Sunday = 0 … Saturday = 6 (the same numbering as `taskflow_settings.week_starts_on`). */
export function weekdayIndex(day: Day): number {
  const [y, m, d] = parseDay(day)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Day of week for a date string, Monday = 0 … Sunday = 6. */
export function weekdayOf(day: Day): number {
  return (weekdayIndex(day) + 6) % 7
}

/** First and last day of the week containing `day`. `weekStart`: 0 = Sunday, 1 = Monday (default) … 6 = Saturday. */
export function weekBounds(day: Day, weekStart = 1): { start: Day; end: Day } {
  const start = addDays(day, -((weekdayIndex(day) - weekStart + 7) % 7))
  return { start, end: addDays(start, 6) }
}

/** First and last day of the month containing `day`. */
export function monthBounds(day: Day): { start: Day; end: Day } {
  const [y, m] = parseDay(day)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { start: `${pad(y, 4)}-${pad(m)}-01`, end: `${pad(y, 4)}-${pad(m)}-${pad(last)}` }
}

/** First day of the month `n` months from the month containing `day`. */
export function addMonths(day: Day, n: number): Day {
  const [y, m] = parseDay(day)
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-01`
}

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })

/** `Mon 9 Nov` — formats a date string without any time-zone shift. */
export function formatDay(day: Day): string {
  const [y, m, d] = parseDay(day)
  const parts = Object.fromEntries(dayFormat.formatToParts(new Date(Date.UTC(y, m - 1, d, 12))).map((p) => [p.type, p.value]))
  return `${parts.weekday} ${parts.day} ${parts.month}`
}

const monthFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', month: 'short', year: 'numeric' })
/** `Nov 2026` for any day in the month. */
export function formatMonth(day: Day): string {
  const [y, m] = parseDay(day)
  return monthFormat.format(new Date(Date.UTC(y, m - 1, 1, 12)))
}

const timeFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true })
/** `4:12 p.m.` — clock time of a moment, in Toronto. */
export function formatTime(instant: Instant): string {
  return timeFormat.format(toDate(instant)).replace(/\s?([ap])\.?m\.?/i, (_, x: string) => ` ${x.toLowerCase()}m`)
}

/** `2026-11-10T14:30` (the value of a datetime-local input) read as a Toronto wall-clock time. A repeated time (fall back) is the first one; a skipped time (spring forward) lands after the gap. */
export function torontoLocalToInstant(local: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(local)
  if (!m) throw new Error(`Invalid local time: ${local}`)
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  const offsets = [...new Set([offsetMs(new Date(guess - 86_400_000)), offsetMs(new Date(guess + 86_400_000))])]
  const candidates = offsets.map((o) => new Date(guess - o)).sort((a, b) => a.getTime() - b.getTime())
  return candidates.find((c) => instantToTorontoLocal(c) === local) ?? candidates[candidates.length - 1]
}

/** The datetime-local value (`YYYY-MM-DDTHH:mm`) for a moment, in Toronto. */
export function instantToTorontoLocal(instant: Instant): string {
  const p = torontoParts(toDate(instant))
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`
}

/** Minutes from text like `90`, `45m`, `1h`, `1h30`, `1h 30m`, `1.5h`, `1:30`; null if it isn't a positive duration. */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase()
  if (!t) return null
  let mins: number | null = null
  let m: RegExpExecArray | null
  if ((m = /^(\d+):(\d{1,2})$/.exec(t))) mins = +m[1] * 60 + +m[2]
  else if ((m = /^(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?$/.exec(t))) mins = Math.round(parseFloat(m[1]) * 60)
  else if ((m = /^(?:(\d+)\s*h(?:ours?|rs?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?$/.exec(t)) && (m[1] || m[2])) mins = (m[1] ? +m[1] * 60 : 0) + (m[2] ? +m[2] : 0)
  else if ((m = /^(\d+)\s*h\s*(\d+)$/.exec(t))) mins = +m[1] * 60 + +m[2]
  else if ((m = /^(\d+)$/.exec(t))) mins = +m[1]
  return mins !== null && mins > 0 ? mins : null
}
